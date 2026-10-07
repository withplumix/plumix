import { resolve } from "node:path";
import type { MigrationDatabase, RuntimeMigrations } from "plumix";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { NodeSqliteClient } from "../node-sqlite-client.js";
import { MigrateApplyError } from "../errors.js";
import { drizzleNodeSqlite, openNodeSqlite } from "../node-sqlite-client.js";
import { isNodeSqlite } from "../node-sqlite.js";

function migrationDatabase(client: NodeSqliteClient): MigrationDatabase {
  return {
    // Async so a failure rejects rather than throws, as on every runtime.
    // drizzle's migrator splits each file on its own breakpoint marker, so a
    // trigger body arrives whole.
    async migrate(folder) {
      migrate(drizzleNodeSqlite(client, {}), folder);
    },
    async all(sql) {
      return client.prepare(sql).all();
    },
    async batch(statements) {
      client.prepare("BEGIN").run();
      try {
        for (const { sql, params } of statements) {
          client.prepare(sql).run(...params);
        }
        client.prepare("COMMIT").run();
      } catch (error) {
        client.prepare("ROLLBACK").run();
        throw error;
      }
    },
    async close() {
      client.close();
    },
  };
}

/** `plumix migrate` opens the file `nodeSqlite()` names, against the project root. */
export const migrations: RuntimeMigrations = {
  remote: false,
  legacyTable: "__drizzle_migrations",
  open({ cwd, app, location }) {
    const database = app.config.database;
    if (!isNodeSqlite(database)) {
      return Promise.reject(
        MigrateApplyError.databaseNotNodeSqlite({ kind: database.kind }),
      );
    }
    const path =
      location === "memory" ? ":memory:" : resolve(cwd, database.config.path);
    return Promise.resolve(migrationDatabase(openNodeSqlite(path)));
  },
};
