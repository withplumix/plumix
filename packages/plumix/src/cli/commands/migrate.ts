import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  AnyPluginDescriptor,
  CommandContext,
  CommandDefinition,
} from "@plumix/core";
import {
  CliError,
  collectRawSqlMigrations,
  generateSchemaSource,
  planRawSqlMigrations,
  spawnCapturingStderr,
} from "@plumix/core";

import { report } from "../report.js";

const SCHEMA_OUT = ".plumix/schema.ts";
const MIGRATIONS_OUT = "drizzle";

export const migrateCommand: CommandDefinition = {
  describe: "Generate or apply database migrations",
  async run(ctx) {
    const sub = ctx.argv[0];
    if (sub === undefined || sub === "generate") {
      await migrateGenerate(ctx);
      return;
    }
    if (Object.hasOwn(ctx.runtimeMigrate, sub)) {
      const runtimeSub = ctx.runtimeMigrate[sub];
      if (runtimeSub) {
        await runtimeSub.run({ ...ctx, argv: ctx.argv.slice(1) });
        return;
      }
    }
    throw CliError.unknownSubcommand({
      command: "migrate",
      subcommand: sub,
      supported: ["generate", ...Object.keys(ctx.runtimeMigrate)],
    });
  },
};

async function migrateGenerate(ctx: CommandContext): Promise<void> {
  const { cwd, app } = ctx;
  const schemaPath = writeSchema(cwd, app.config);

  const bin = migrateGenerateDeps.resolveDrizzleKitBin(cwd);
  if (bin === null) {
    throw CliError.migrateGenerateNoDrizzleKit();
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
  if (stderr.trim() !== "") throw CliError.migrateGenerateFailed();
  report.success(`Migrations emitted in ${MIGRATIONS_OUT}/`);

  for (const tag of emitRawSqlMigrations(cwd, app.config.plugins)) {
    report.success(`Raw SQL migration emitted: ${MIGRATIONS_OUT}/${tag}.sql`);
  }
}

/** Runs after the diff so the DDL lands behind the tables it touches. */
export function emitRawSqlMigrations(
  cwd: string,
  plugins: readonly AnyPluginDescriptor[],
): readonly string[] {
  const declared = collectRawSqlMigrations(plugins);
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

// drizzle-kit's on-disk journal shape, borrowed rather than re-declared so
// it stays off `@plumix/core`'s published surface.
type MigrationJournal = Parameters<typeof planRawSqlMigrations>[1];

function readJournal(journalPath: string): MigrationJournal {
  try {
    return JSON.parse(readFileSync(journalPath, "utf8")) as MigrationJournal;
  } catch (cause) {
    throw CliError.migrateGenerateJournalUnreadable({ journalPath, cause });
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
