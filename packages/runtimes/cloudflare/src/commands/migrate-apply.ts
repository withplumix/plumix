import type { CommandDefinition } from "plumix";
import { CliError, spawnInherit } from "plumix";

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
    throw CliError.migrateApplyMissingDb();
  }

  const [firstName, ...moreNames] = config.d1Databases
    .map((db) => db.database_name)
    .filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );

  if (firstName === undefined) {
    throw CliError.migrateApplyNoD1({ filename: config.filename });
  }
  if (moreNames.length > 0) {
    throw CliError.migrateApplyAmbiguousDb({
      filename: config.filename,
      names: [firstName, ...moreNames],
    });
  }
  return { databaseName: firstName, passthroughArgs: argv };
}

// Mutable seam for tests — swap without vi.mock ceremony.
export const migrateApplyDeps = {
  loadWranglerConfig,
  spawnInherit,
};
