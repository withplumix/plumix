import { relative, resolve } from "node:path";
import type { MigrationDatabase, RuntimeMigrations } from "plumix/cli";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { NodeSqliteClient } from "../node-sqlite-client.js";
import { MigrationsError } from "../errors.js";
import { drizzleNodeSqlite, openNodeSqlite } from "../node-sqlite-client.js";
import { isNodeSqlite } from "../node-sqlite.js";

/** The driver is synchronous; a failure still rejects, as on every runtime. */
function settle<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

function migrationDatabase(
  client: NodeSqliteClient,
  summary: string,
): MigrationDatabase {
  const drizzle = drizzleNodeSqlite(client, {});
  return {
    drizzle,
    // drizzle's migrator splits each file on its own breakpoint marker, so a
    // trigger body arrives whole.
    migrate: (folder) =>
      settle(() => {
        migrate(drizzle, folder);
      }),
    all: (sql) => settle(() => client.prepare(sql).all()),
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
    target: { remote: false, summary, notes: [] },
  };
}

/**
 * `plumix migrate` opens the file `nodeSqlite()` names, against the project
 * root.
 */
export const migrations: RuntimeMigrations = {
  legacyTable: "__drizzle_migrations",
  open({ cwd, config, location }) {
    const database = config.database;
    if (!isNodeSqlite(database)) {
      return Promise.reject(
        MigrationsError.databaseNotNodeSqlite({ kind: database.kind }),
      );
    }
    const path =
      location === "memory" ? ":memory:" : resolve(cwd, database.config.path);
    return Promise.resolve(
      migrationDatabase(
        openNodeSqlite(path),
        location === "memory" ? "memory" : `local · ${relative(cwd, path)}`,
      ),
    );
  },
};
