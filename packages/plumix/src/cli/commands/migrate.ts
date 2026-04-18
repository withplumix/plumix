import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CommandContext, CommandDefinition } from "@plumix/core";
import { CliError, generateSchemaSource } from "@plumix/core";

import { report } from "../report.js";
import { spawnInherit } from "../spawn.js";

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
    throw new CliError("drizzle-kit is not installed in this project", {
      code: "MIGRATE_GENERATE_NO_DRIZZLE_KIT",
      hint: "Install it as a devDependency (e.g. `pnpm add -D drizzle-kit`) and rerun `plumix migrate generate`.",
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
  try {
    const req = createRequire(pathToFileURL(resolve(cwd, "package.json")).href);
    return req.resolve("drizzle-kit/bin.cjs");
  } catch {
    return null;
  }
}

// Mutable seam for tests — swap without vi.mock ceremony.
export const migrateGenerateDeps = {
  resolveDrizzleKitBin,
  spawnInherit,
};
