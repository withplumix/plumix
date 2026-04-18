import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import type { CommandDefinition } from "@plumix/core";
import { CliError, generateSchemaSource } from "@plumix/core";

import { report } from "../report.js";

export const migrateCommand: CommandDefinition = {
  describe: "Generate a migration from the merged schema",
  run(ctx) {
    const sub = ctx.argv[0];
    if (sub === undefined || sub === "generate") {
      migrateGenerate(ctx.cwd, ctx.app.config);
      return;
    }
    throw new CliError(`Unknown subcommand: migrate ${sub}`, {
      code: "UNKNOWN_SUBCOMMAND",
      hint: "Supported: `plumix migrate generate`.",
    });
  },
};

function migrateGenerate(
  cwd: string,
  config: Parameters<typeof generateSchemaSource>[0],
): void {
  const { source } = generateSchemaSource(config);
  const outFile = resolve(cwd, ".plumix/schema.ts");
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, source, "utf8");

  const relPath = relative(cwd, outFile) || outFile;
  report.success(`Schema emitted: ${relPath}`);
  report.info("");
  report.info("Next: run drizzle-kit to generate the migration SQL:");
  report.info(
    `  pnpm exec drizzle-kit generate --schema ${relPath} --dialect sqlite --out drizzle`,
  );
  report.info("");
  report.info("Apply on Cloudflare D1:");
  report.info("  pnpm exec wrangler d1 migrations apply <db-name>");
}
