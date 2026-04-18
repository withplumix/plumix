import type { CommandDefinition } from "@plumix/core";
import { CliError } from "@plumix/core";

import { spawnInherit } from "./spawn.js";

export const migrateApplyCommand: CommandDefinition = {
  describe: "Apply pending D1 migrations (wrangler d1 migrations apply)",
  async run(ctx) {
    const [databaseName, ...rest] = ctx.argv;
    if (!databaseName) {
      throw new CliError("Missing D1 database name", {
        code: "MIGRATE_APPLY_MISSING_DB",
        hint: "Run `plumix migrate apply <database-name> [--remote|--local]`. The name matches `database_name` in wrangler.jsonc.",
      });
    }
    await spawnInherit(
      "wrangler",
      ["d1", "migrations", "apply", databaseName, ...rest],
      { cwd: ctx.cwd },
    );
  },
};
