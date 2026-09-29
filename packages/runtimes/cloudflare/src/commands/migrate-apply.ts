import type { CommandDefinition } from "plumix/cli";
import { spawnInherit } from "plumix/cli";

import { loadWranglerConfig } from "../wrangler-config.js";
import { CloudflareCliError } from "./errors.js";

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
    throw CloudflareCliError.migrateApplyMissingDb();
  }

  const [firstName, ...moreNames] = config.d1Databases
    .map((db) => db.database_name)
    .filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );

  if (firstName === undefined) {
    throw CloudflareCliError.migrateApplyNoD1({ filename: config.filename });
  }
  if (moreNames.length > 0) {
    throw CloudflareCliError.migrateApplyAmbiguousDb({
      filename: config.filename,
      names: [firstName, ...moreNames],
    });
  }
  return { databaseName: firstName, passthroughArgs: argv };
}

// Mutable seam for tests — substitute the collaborator, not the module path.
export const migrateApplyDeps = {
  loadWranglerConfig,
  spawnInherit,
};
