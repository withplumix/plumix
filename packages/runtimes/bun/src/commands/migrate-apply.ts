import { resolve } from "node:path";
import type { CommandDefinition } from "plumix";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { drizzleBunSqlite, openBunSqlite } from "../bun-sqlite-client.js";
import { databaseFile, isBunSqlite } from "../bun-sqlite.js";
import { MigrateApplyError } from "../errors.js";

// Where `plumix migrate generate` writes; drizzle's migrator splits each file
// on its own breakpoint marker, so a trigger body arrives whole.
const MIGRATIONS_DIR = "drizzle";

export const migrateApplyCommand: CommandDefinition = {
  describe: "Apply pending migrations to the configured SQLite file",
  run(ctx) {
    const database = ctx.app.config.database;
    if (!isBunSqlite(database)) {
      throw MigrateApplyError.databaseNotBunSqlite({ kind: database.kind });
    }
    const client = openBunSqlite(databaseFile(database.config, ctx.cwd));
    try {
      migrate(drizzleBunSqlite(client, {}), {
        migrationsFolder: resolve(ctx.cwd, MIGRATIONS_DIR),
      });
    } finally {
      client.close();
    }
  },
};
