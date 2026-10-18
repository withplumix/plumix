import { relative } from "node:path";
import type { MigrationDatabase, RuntimeMigrations } from "plumix/cli";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import type { BunSqliteClient } from "../bun-sqlite-client.js";
import { drizzleBunSqlite, openBunSqlite } from "../bun-sqlite-client.js";
import { databaseFile, isBunSqlite } from "../bun-sqlite.js";
import { MigrationsError } from "../errors.js";

/** The driver is synchronous; a failure still rejects, as on every runtime. */
function settle<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

function inTransaction(client: BunSqliteClient, work: () => void): void {
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
function wipe(client: BunSqliteClient): void {
  const [pragma] = client.prepare("PRAGMA foreign_keys").all() as {
    foreign_keys: number;
  }[];
  client.prepare("PRAGMA foreign_keys = OFF").run();
  try {
    inTransaction(client, () => {
      const tables = client.prepare(TABLES_SQL).all() as { name: string }[];
      for (const { name } of tables) {
        client
          .prepare(`DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`)
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
  client: BunSqliteClient,
  name: string,
): MigrationDatabase {
  const drizzle = drizzleBunSqlite(client, {});
  return {
    drizzle,
    // drizzle's migrator splits each file on its own breakpoint marker, so a
    // trigger body arrives whole.
    migrate: (folder) =>
      settle(() => {
        migrate(drizzle, folder);
      }),
    all: (sql) =>
      settle(() => client.prepare(sql).all() as Record<string, unknown>[]),
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
 * `plumix migrate` opens the file `bunSqlite()` names, against the project
 * root.
 */
export const migrations: RuntimeMigrations = {
  legacyTable: "__drizzle_migrations",
  open({ cwd, config, location }) {
    const database = config.database;
    if (!isBunSqlite(database)) {
      return Promise.reject(
        MigrationsError.databaseNotBunSqlite({ kind: database.kind }),
      );
    }
    const path =
      location === "memory" ? ":memory:" : databaseFile(database.config, cwd);
    return Promise.resolve(
      migrationDatabase(
        openBunSqlite(path),
        location === "memory" ? "memory" : relative(cwd, path),
      ),
    );
  },
  // The slot opens the same file from the process env, as on a request.
  openRun({ cwd, config }) {
    const database = config.database;
    if (!isBunSqlite(database)) {
      return Promise.reject(
        MigrationsError.databaseNotBunSqlite({ kind: database.kind }),
      );
    }
    const path = databaseFile(database.config, cwd);
    return Promise.resolve({
      env: process.env,
      target: {
        remote: false,
        summary: `local · ${relative(cwd, path)}`,
        notes: [],
      },
      close: () => Promise.resolve(),
    });
  },
};
