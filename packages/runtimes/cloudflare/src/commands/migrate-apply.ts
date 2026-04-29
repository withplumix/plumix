import type { CommandDefinition } from "@plumix/core";
import { CliError, spawnInherit } from "@plumix/core";

import { loadWranglerConfig } from "../wrangler-config.js";

export const migrateApplyCommand: CommandDefinition = {
  describe: "Apply pending D1 migrations (wrangler d1 migrations apply)",
  async run(ctx) {
    const { databaseName, passthroughArgs } = resolveDatabaseName(
      ctx.argv,
      ctx.cwd,
    );
    await migrateApplyDeps.spawnInherit(
      "wrangler",
      ["d1", "migrations", "apply", databaseName, ...passthroughArgs],
      { cwd: ctx.cwd },
    );
  },
};

function resolveDatabaseName(
  argv: readonly string[],
  cwd: string,
): { databaseName: string; passthroughArgs: readonly string[] } {
  const [first, ...rest] = argv;
  // Positional wins over auto-discovery. A leading flag means no positional.
  if (first !== undefined && !first.startsWith("-")) {
    return { databaseName: first, passthroughArgs: rest };
  }

  const config = migrateApplyDeps.loadWranglerConfig(cwd);
  if (config === null) {
    throw new CliError("Missing D1 database name", {
      code: "MIGRATE_APPLY_MISSING_DB",
      hint: "Pass the database name: `plumix migrate apply <database-name>`. Or add a wrangler.jsonc / wrangler.toml with a `d1_databases` entry so Plumix can auto-discover it.",
    });
  }

  const [firstName, ...moreNames] = config.d1Databases
    .map((db) => db.database_name)
    .filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );

  if (firstName === undefined) {
    throw new CliError(
      `No d1_databases entries with a database_name in ${config.filename}`,
      {
        code: "MIGRATE_APPLY_NO_D1",
        hint: "Add a `d1_databases` entry with a `database_name`, or pass the name explicitly: `plumix migrate apply <database-name>`.",
      },
    );
  }
  if (moreNames.length > 0) {
    throw new CliError(
      `Multiple D1 databases found in ${config.filename}: ${[firstName, ...moreNames].join(", ")}`,
      {
        code: "MIGRATE_APPLY_AMBIGUOUS_DB",
        hint: "Pass the name explicitly: `plumix migrate apply <database-name>`.",
      },
    );
  }
  return { databaseName: firstName, passthroughArgs: argv };
}

// Mutable seam for tests — swap without vi.mock ceremony.
export const migrateApplyDeps = {
  loadWranglerConfig,
  spawnInherit,
};
