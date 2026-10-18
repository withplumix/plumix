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

function inTransaction(client: NodeSqliteClient, work: () => void): void {
  client.prepare("BEGIN").run();
  try {
    work();
    client.prepare("COMMIT").run();
  } catch (error) {
    client.prepare("ROLLBACK").run();
    throw error;
  }
}

/** A virtual table first, so its shadow tables go with it. */
const TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY sql NOT LIKE 'CREATE VIRTUAL TABLE%'";

/**
 * SQLite ignores `PRAGMA foreign_keys` inside a transaction, so the drops'
 * transaction runs with it turned off, then set back.
 */
function wipe(client: NodeSqliteClient): void {
  const [pragma] = client.prepare("PRAGMA foreign_keys").all();
  client.prepare("PRAGMA foreign_keys = OFF").run();
  try {
    inTransaction(client, () => {
      for (const { name } of client.prepare(TABLES_SQL).all()) {
        client
          .prepare(
            `DROP TABLE IF EXISTS "${String(name).replaceAll('"', '""')}"`,
          )
          .run();
      }
    });
  } finally {
    client
      .prepare(`PRAGMA foreign_keys = ${Number(pragma?.foreign_keys)}`)
      .run();
  }
}

function migrationDatabase(
  client: NodeSqliteClient,
  name: string,
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
        inTransaction(client, () => {
          for (const { sql, params } of statements) {
            client.prepare(sql).run(...params);
          }
        });
      }),
    wipe: () =>
      settle(() => {
        wipe(client);
      }),
    close: () =>
      settle(() => {
        client.close();
      }),
    target: {
      remote: false,
      summary: name === "memory" ? name : `local · ${name}`,
      notes: [],
      name,
    },
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
        location === "memory" ? "memory" : relative(cwd, path),
      ),
    );
  },
  // The slot opens the same file from the process env, as on a request.
  openRun({ cwd, config }) {
    const database = config.database;
    if (!isNodeSqlite(database)) {
      return Promise.reject(
        MigrationsError.databaseNotNodeSqlite({ kind: database.kind }),
      );
    }
    const path = resolve(cwd, database.config.path);
    return Promise.resolve({
      env: process.env,
      target: {
        remote: false,
        summary: `local · ${relative(cwd, path)}`,
        notes: [],
        name: relative(cwd, path),
      },
      close: () => Promise.resolve(),
    });
  },
};
