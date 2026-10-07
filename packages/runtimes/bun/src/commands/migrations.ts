import type { MigrationDatabase, RuntimeMigrations } from "plumix";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import type { BunSqliteClient } from "../bun-sqlite-client.js";
import { drizzleBunSqlite, openBunSqlite } from "../bun-sqlite-client.js";
import { databaseFile, isBunSqlite } from "../bun-sqlite.js";
import { MigrateApplyError } from "../errors.js";

function migrationDatabase(client: BunSqliteClient): MigrationDatabase {
  return {
    // Async so a failure rejects rather than throws, as on every runtime.
    // drizzle's migrator splits each file on its own breakpoint marker, so a
    // trigger body arrives whole.
    async migrate(folder) {
      migrate(drizzleBunSqlite(client, {}), folder);
    },
    async all(sql) {
      return client.prepare(sql).all() as Record<string, unknown>[];
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

/** `plumix migrate` opens the file `bunSqlite()` names, against the project root. */
export const migrations: RuntimeMigrations = {
  remote: false,
  legacyTable: "__drizzle_migrations",
  open({ cwd, app, location }) {
    const database = app.config.database;
    if (!isBunSqlite(database)) {
      return Promise.reject(
        MigrateApplyError.databaseNotBunSqlite({ kind: database.kind }),
      );
    }
    const path =
      location === "memory" ? ":memory:" : databaseFile(database.config, cwd);
    return Promise.resolve(migrationDatabase(openBunSqlite(path)));
  },
};
