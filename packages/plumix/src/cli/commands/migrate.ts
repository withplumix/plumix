import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

import type {
  CommandContext,
  CommandDefinition,
  MigrationDatabase,
  RuntimeMigrations,
} from "@plumix/core";
import { spawnCapturingStderr } from "@plumix/core/cli";

import type { MigrationOwner } from "../migrate/owners.js";
import { PlumixCliError } from "../errors.js";
import {
  adoptLegacyDatabase,
  applyOwners,
  reportStatus,
} from "../migrate/apply.js";
import {
  nearestPackageRoot,
  resolveOwners,
  SITE_SCHEMA_OUT,
  sitePlugins,
  siteRootOf,
} from "../migrate/owners.js";
import { report } from "../report.js";

export const migrateCommand: CommandDefinition = {
  describe: "Apply each table owner's migrations, or generate the site's",
  async run(ctx) {
    // `generate` takes no arguments, so it parses none.
    if (ctx.argv[0] === "generate") {
      await migrateGenerate(ctx);
      return;
    }
    const { sub, remote, binding } = parseMigrateArgs(ctx.argv);
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

/**
 * Owners resolve before anything is deleted or opened, so a missing history
 * fails with the database untouched.
 */
async function withDatabase(
  ctx: CommandContext,
  target: Pick<MigrateArgs, "remote" | "binding">,
  work: MigrationWork,
  beforeOpen?: () => void,
): Promise<void> {
  const migrations = runtimeMigrations(ctx);
  if (target.remote && !migrations.remote) {
    throw PlumixCliError.migrateRemoteUnsupported({
      runtime: ctx.app.config.runtime.name,
    });
  }
  const owners = resolveOwners(ctx.cwd, ctx.configPath, ctx.app.config);
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

/** Adoption builds its scratch database through the same runtime, in memory. */
function adoptAndApply(
  ctx: CommandContext,
  binding: string | undefined,
): MigrationWork {
  return async (db, owners, migrations) => {
    await adoptLegacyDatabase(
      db,
      owners,
      siteTables(ctx),
      migrations.legacyTable,
      () =>
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

function siteTables(ctx: CommandContext): readonly string[] {
  return sitePlugins(ctx.cwd, ctx.configPath, ctx.app.config).flatMap(
    (plugin) =>
      Object.values(plugin.schema ?? {}).flatMap((value) =>
        is(value, SQLiteTable) ? [getTableName(value)] : [],
      ),
  );
}

/**
 * The paths the runtime's `plumix.e2e.wipe` names, the local state an e2e run
 * starts from nothing, read off the runtime package that provides the commands
 * module.
 */
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
  const { cwd, configPath, app } = ctx;
  const modules = [
    ...new Set(
      sitePlugins(cwd, configPath, app.config).flatMap(
        (plugin) => plugin.schemaModule ?? [],
      ),
    ),
  ];
  if (modules.length === 0) {
    report.info(
      "This site owns no tables: no plugin's schemaModule resolves inside it, so there is nothing to generate.",
    );
    return;
  }
  writeSiteSchema(cwd, modules);

  const bin = migrateGenerateDeps.resolveDrizzleKitBin(cwd);
  if (bin === null) {
    throw PlumixCliError.migrateGenerateNoDrizzleKit();
  }

  // Where `plumix migrate` reads the site's history from.
  const out = relative(cwd, join(siteRootOf(configPath), "migrations"));
  report.info("Running drizzle-kit generate…");
  const stderr = await migrateGenerateDeps.spawnCapturingStderr(
    process.execPath,
    [
      // Same reason as the env below; drizzle-kit's own `console.error`
      // still comes through.
      "--no-warnings",
      bin,
      "generate",
      "--dialect",
      "sqlite",
      // Matches the runtime drizzle config; without it every query fails with
      // `no such column`.
      "--casing",
      "snake_case",
      "--schema",
      SITE_SCHEMA_OUT,
      "--out",
      out,
    ],
    // Failure is read off stderr, so inherited `NODE_OPTIONS`/`NODE_DEBUG`
    // output would read as a failed generate.
    { cwd, env: { NODE_OPTIONS: undefined, NODE_DEBUG: undefined } },
  );
  // A successful generate — including one that finds nothing to do —
  // writes nothing here, so anything at all means it bailed.
  if (stderr.trim() !== "") throw PlumixCliError.migrateGenerateFailed();
  report.success(`The site's own tables are migrated in ${out}/`);
}

/**
 * Only the site's own schema modules: core's and every package's tables are
 * in the histories those packages ship.
 */
function writeSiteSchema(cwd: string, modules: readonly string[]): void {
  const source = [
    "// Generated by plumix migrate generate — do not edit.",
    "",
    ...modules.map((spec) => `export * from ${JSON.stringify(spec)};`),
    "",
  ].join("\n");
  const outFile = resolve(cwd, SITE_SCHEMA_OUT);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, source, "utf8");
  report.success(`Schema emitted: ${SITE_SCHEMA_OUT}`);
}

function resolveDrizzleKitBin(cwd: string): string | null {
  // The consumer's drizzle-kit wins so they can pin a version. Its `exports`
  // hide `./bin.cjs`, so walk from the main entry.
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

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 */
export const migrateGenerateDeps = {
  resolveDrizzleKitBin,
  spawnCapturingStderr,
};
