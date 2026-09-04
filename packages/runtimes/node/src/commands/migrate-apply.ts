import { resolve } from "node:path";
import type { CommandDefinition } from "plumix";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { MigrateApplyError } from "../errors.js";
import { drizzleNodeSqlite, openNodeSqlite } from "../node-sqlite-client.js";
import { isNodeSqlite } from "../node-sqlite.js";

// Where `plumix migrate generate` writes; drizzle's migrator splits each file
// on its own breakpoint marker, so a trigger body arrives whole.
const MIGRATIONS_DIR = "drizzle";

export const migrateApplyCommand: CommandDefinition = {
  describe: "Apply pending migrations to the configured SQLite file",
  run(ctx) {
    const database = ctx.app.config.database;
    if (!isNodeSqlite(database)) {
      throw MigrateApplyError.databaseNotNodeSqlite({ kind: database.kind });
    }
    const client = openNodeSqlite(resolve(ctx.cwd, database.config.path));
    try {
      migrate(drizzleNodeSqlite(client, {}), {
        migrationsFolder: resolve(ctx.cwd, MIGRATIONS_DIR),
      });
    } finally {
      client.close();
    }
  },
};
