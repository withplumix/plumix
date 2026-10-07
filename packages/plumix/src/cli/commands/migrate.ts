import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type {
  CommandContext,
  CommandDefinition,
  MigrationDatabase,
  RuntimeMigrations,
} from "@plumix/core";
import {
  collectRawSqlMigrations,
  generateSchemaSource,
  planRawSqlMigrations,
  spawnCapturingStderr,
} from "@plumix/core/cli";

import type { MigrationOwner } from "../migrate/owners.js";
import { PlumixCliError } from "../errors.js";
import {
  adoptLegacyDatabase,
  applyOwners,
  reportStatus,
} from "../migrate/apply.js";
import { nearestPackageRoot, resolveOwners } from "../migrate/owners.js";
import { report } from "../report.js";

const SCHEMA_OUT = ".plumix/schema.ts";
const MIGRATIONS_OUT = "drizzle";

export const migrateCommand: CommandDefinition = {
  describe: "Apply each table owner's migrations, or generate the site's",
  async run(ctx) {
    const { sub, remote, binding } = parseMigrateArgs(ctx.argv);
    if (sub === "generate") {
      await migrateGenerate(ctx);
      return;
    }
    if (sub === undefined) {
      await withDatabase(ctx, { remote, binding }, adoptAndApply(ctx, binding));
      return;
    }
    if (sub === "fresh") {
      if (remote) throw PlumixCliError.migrateFreshRemote();
      await withDatabase(ctx, { remote, binding }, applyOwners, () => {
        wipeLocalState(ctx);
      });
      return;
    }
    if (sub === "status") {
      await withDatabase(ctx, { remote, binding }, reportStatus);
      return;
    }
    throw PlumixCliError.unknownSubcommand({
      command: "migrate",
      subcommand: sub,
      supported: ["fresh", "status", "generate"],
    });
  },
};

interface MigrateArgs {
  readonly sub: string | undefined;
  readonly remote: boolean;
  readonly binding: string | undefined;
}

function parseMigrateArgs(argv: readonly string[]): MigrateArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        remote: { type: "boolean", default: false },
        binding: { type: "string" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (cause) {
    throw PlumixCliError.migrateInvalidArguments({ cause });
  }
  const [sub, extra] = parsed.positionals;
  if (extra !== undefined) {
    throw PlumixCliError.migrateInvalidArguments({
      cause: `Unexpected argument '${extra}'`,
    });
  }
  return { sub, remote: parsed.values.remote, binding: parsed.values.binding };
}

function runtimeMigrations(ctx: CommandContext): RuntimeMigrations {
  if (ctx.runtimeMigrations === undefined) {
    throw PlumixCliError.migrateRuntimeUnsupported({
      runtime: ctx.app.config.runtime.name,
    });
  }
  return ctx.runtimeMigrations;
}

// Owners resolve before anything is deleted or opened, so a missing history
// fails with the database untouched.
async function withDatabase(
  ctx: CommandContext,
  target: { readonly remote: boolean; readonly binding: string | undefined },
  work: MigrationWork,
  beforeOpen?: () => void,
): Promise<void> {
  const migrations = runtimeMigrations(ctx);
  if (target.remote && !migrations.remote) {
    throw PlumixCliError.migrateRemoteUnsupported({
      runtime: ctx.app.config.runtime.name,
    });
  }
  const owners = resolveOwners(ctx.cwd, ctx.app.config);
  beforeOpen?.();
  const db = await migrations.open({
    cwd: ctx.cwd,
    app: ctx.app,
    location: target.remote ? "remote" : "local",
    binding: target.binding,
  });
  try {
    await work(db, owners, migrations);
  } finally {
    await db.close();
  }
}

type MigrationWork = (
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  migrations: RuntimeMigrations,
) => Promise<void>;

// Adoption builds its scratch database through the same runtime, in memory.
function adoptAndApply(
  ctx: CommandContext,
  binding: string | undefined,
): MigrationWork {
  return async (db, owners, migrations) => {
    await adoptLegacyDatabase(db, owners, migrations.legacyTable, () =>
      migrations.open({
        cwd: ctx.cwd,
        app: ctx.app,
        location: "memory",
        binding,
      }),
    );
    await applyOwners(db, owners);
  };
}

// The paths the runtime's `plumix.e2e.wipe` names — the same local state an
// e2e run starts from nothing — read off the runtime package that provides the
// commands module.
function wipeLocalState(ctx: CommandContext): void {
  const runtime = ctx.app.config.runtime;
  const wipe = runtime.commandsModule
    ? readRuntimeWipe(ctx.cwd, runtime.commandsModule)
    : undefined;
  if (wipe === undefined) {
    throw PlumixCliError.migrateFreshNoWipe({ runtime: runtime.name });
  }
  for (const path of wipe) {
    rmSync(resolve(ctx.cwd, path), { recursive: true, force: true });
  }
}

function readRuntimeWipe(
  cwd: string,
  commandsModule: string,
): readonly string[] | undefined {
  const resolved = createRequire(join(cwd, "noop.js")).resolve(commandsModule);
  const root = nearestPackageRoot(resolved);
  if (root === null) return undefined;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    plumix?: { e2e?: { wipe?: readonly string[] } };
  };
  return pkg.plumix?.e2e?.wipe;
}

async function migrateGenerate(ctx: CommandContext): Promise<void> {
  const { cwd, app } = ctx;
  const schemaPath = writeSchema(cwd, app.config);

  const bin = migrateGenerateDeps.resolveDrizzleKitBin(cwd);
  if (bin === null) {
    throw PlumixCliError.migrateGenerateNoDrizzleKit();
  }

  report.info("Running drizzle-kit generate…");
  const stderr = await migrateGenerateDeps.spawnCapturingStderr(
    process.execPath,
    [
      // Same reason as the env below; drizzle-kit's own `console.error`
      // still comes through.
      "--no-warnings",
      bin,
      "generate",
      "--schema",
      schemaPath,
      "--dialect",
      "sqlite",
      "--out",
      MIGRATIONS_OUT,
      // Match the runtime drizzle config, which sets `casing: "snake_case"`
      // for D1. Without this, generated SQL keeps schema-side camelCase
      // (`emailVerifiedAt`) but runtime queries snake_case (`email_verified_at`)
      // — every INSERT/SELECT then fails with `no such column`.
      "--casing",
      "snake_case",
    ],
    // Failure is read off this child's stderr, so nothing inherited may
    // write there: `NODE_OPTIONS=--inspect` prints a debugger banner and
    // `NODE_DEBUG` a running log, either of which would read as a failed
    // generate.
    { cwd, env: { NODE_OPTIONS: undefined, NODE_DEBUG: undefined } },
  );
  // A successful generate — including one that finds nothing to do —
  // writes nothing here, so anything at all means it bailed.
  if (stderr.trim() !== "") throw PlumixCliError.migrateGenerateFailed();
  report.success(`Migrations emitted in ${MIGRATIONS_OUT}/`);

  for (const tag of emitRawSqlMigrations(
    cwd,
    collectRawSqlMigrations(app.config.plugins),
  )) {
    report.success(`Raw SQL migration emitted: ${MIGRATIONS_OUT}/${tag}.sql`);
  }
}

/** Runs after the diff so the DDL lands behind the tables it touches. */
export function emitRawSqlMigrations(
  cwd: string,
  declared: RawSqlMigrations,
): readonly string[] {
  if (declared.length === 0) return [];

  const outDir = resolve(cwd, MIGRATIONS_OUT);
  const journalPath = join(outDir, "meta", "_journal.json");
  const plan = planRawSqlMigrations(
    declared,
    readJournal(journalPath),
    Date.now(),
  );
  if (plan.emit.length === 0) return [];

  for (const migration of plan.emit) {
    writeFileSync(join(outDir, `${migration.tag}.sql`), migration.sql, "utf8");
  }
  writeFileSync(journalPath, JSON.stringify(plan.journal, null, 2), "utf8");
  return plan.emit.map((migration) => migration.tag);
}

// The collected declarations and drizzle-kit's on-disk journal shape,
// borrowed rather than re-declared so they stay off `@plumix/core`'s
// published surface.
type RawSqlMigrations = Parameters<typeof planRawSqlMigrations>[0];
type MigrationJournal = Parameters<typeof planRawSqlMigrations>[1];

// A successful generate always leaves a journal, so a missing one means
// drizzle-kit wrote nothing — and numbering core's DDL from zero would put
// the triggers ahead of the `CREATE TABLE` they reference.
function readJournal(journalPath: string): MigrationJournal {
  try {
    return JSON.parse(readFileSync(journalPath, "utf8")) as MigrationJournal;
  } catch (cause) {
    throw PlumixCliError.migrateGenerateJournalUnreadable({
      journalPath,
      cause,
    });
  }
}

function writeSchema(
  cwd: string,
  config: Parameters<typeof generateSchemaSource>[0],
): string {
  const { source } = generateSchemaSource(config);
  const outFile = resolve(cwd, SCHEMA_OUT);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, source, "utf8");
  const rel = relative(cwd, outFile) || outFile;
  report.success(`Schema emitted: ${rel}`);
  return rel;
}

function resolveDrizzleKitBin(cwd: string): string | null {
  // Consumer's own drizzle-kit takes precedence so they can pin a
  // specific version; falls back to the one bundled with plumix.
  // drizzle-kit's `exports` field doesn't expose `./bin.cjs` as a
  // subpath, so we resolve the package's main entry and walk to the
  // bin file (which sits next to it per `package.json#bin`).
  const bases = [
    pathToFileURL(resolve(cwd, "package.json")).href,
    import.meta.url,
  ];
  for (const base of bases) {
    try {
      const main = createRequire(base).resolve("drizzle-kit");
      return resolve(dirname(main), "bin.cjs");
    } catch {
      // try the next base
    }
  }
  return null;
}

// Mutable seam for tests — substitute the collaborator, not the module path.
export const migrateGenerateDeps = {
  resolveDrizzleKitBin,
  spawnCapturingStderr,
};
