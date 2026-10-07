import type { MigrationDatabase, RuntimeMigrations } from "plumix/cli";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import type { BunSqliteClient } from "../bun-sqlite-client.js";
import { drizzleBunSqlite, openBunSqlite } from "../bun-sqlite-client.js";
import { databaseFile, isBunSqlite } from "../bun-sqlite.js";
import { MigrationsError } from "../errors.js";

// The driver is synchronous; a failure still rejects, as on every runtime.
function settle<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

function migrationDatabase(client: BunSqliteClient): MigrationDatabase {
  return {
    // drizzle's migrator splits each file on its own breakpoint marker, so a
    // trigger body arrives whole.
    migrate: (folder) =>
      settle(() => {
        migrate(drizzleBunSqlite(client, {}), folder);
      }),
    all: (sql) =>
      settle(() => client.prepare(sql).all() as Record<string, unknown>[]),
    batch: (statements) =>
      settle(() => {
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
      }),
    close: () =>
      settle(() => {
        client.close();
      }),
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
        MigrationsError.databaseNotBunSqlite({ kind: database.kind }),
      );
    }
    const path =
      location === "memory" ? ":memory:" : databaseFile(database.config, cwd);
    return Promise.resolve(migrationDatabase(openBunSqlite(path)));
  },
};
