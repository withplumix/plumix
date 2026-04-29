import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CommandContext, CommandDefinition } from "@plumix/core";
import { CliError, generateSchemaSource, spawnInherit } from "@plumix/core";

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
    const supported = ["generate", ...Object.keys(ctx.runtimeMigrate)]
      .map((n) => `\`plumix migrate ${n}\``)
      .join(", ");
    throw new CliError(`Unknown subcommand: migrate ${sub}`, {
      code: "UNKNOWN_SUBCOMMAND",
      hint: `Supported: ${supported}.`,
    });
  },
};

async function migrateGenerate(ctx: CommandContext): Promise<void> {
  const { cwd, app } = ctx;
  const schemaPath = writeSchema(cwd, app.config);

  const bin = migrateGenerateDeps.resolveDrizzleKitBin(cwd);
  if (bin === null) {
    throw new CliError("drizzle-kit could not be resolved", {
      code: "MIGRATE_GENERATE_NO_DRIZZLE_KIT",
      hint: "drizzle-kit ships with plumix; rerun `pnpm install` to restore node_modules, or pin a specific version as a devDependency to override.",
    });
  }

  report.info("Running drizzle-kit generate…");
  await migrateGenerateDeps.spawnInherit(
    process.execPath,
    [
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
    { cwd },
  );
  report.success(`Migrations emitted in ${MIGRATIONS_OUT}/`);
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

// Mutable seam for tests — swap without vi.mock ceremony.
export const migrateGenerateDeps = {
  resolveDrizzleKitBin,
  spawnInherit,
};
