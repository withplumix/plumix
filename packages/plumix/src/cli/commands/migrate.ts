import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import type { CommandDefinition } from "@plumix/core";
import { CliError, generateSchemaSource } from "@plumix/core";

import { report } from "../report.js";

export const migrateCommand: CommandDefinition = {
  describe: "Generate or apply database migrations",
  async run(ctx) {
    const sub = ctx.argv[0];
    if (sub === undefined || sub === "generate") {
      migrateGenerate(ctx.cwd, ctx.app.config);
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
