import { resolve } from "node:path";
import type { DatabaseAdapter, PlumixEnv } from "plumix";

import type { BunSqliteDatabase } from "./bun-sqlite-client.js";
import { drizzleBunSqlite, openBunSqlite } from "./bun-sqlite-client.js";
import { PROJECT_ROOT_ENV } from "./entry-constants.js";

export type { BunSqliteDatabase } from "./bun-sqlite-client.js";

export interface BunSqliteConfig {
  /**
   * Path of the SQLite file, relative to the project root; parent
   * directories are created on open.
   */
  readonly path: string;
}

export interface BunSqliteDatabaseAdapter extends DatabaseAdapter {
  readonly config: BunSqliteConfig;
  connect<TSchema extends Record<string, unknown>>(
    env: PlumixEnv,
    request: Request,
    schema: TSchema,
  ): { db: BunSqliteDatabase<TSchema>; close: () => void };
}

/** Where `config.path` names a file, for a project rooted at `root`. */
export function databaseFile(config: BunSqliteConfig, root: string): string {
  return resolve(root, config.path);
}

function projectRoot(env: PlumixEnv): string {
  const root = (env as { readonly [PROJECT_ROOT_ENV]?: unknown })[
    PROJECT_ROOT_ENV
  ];
  return typeof root === "string" && root !== "" ? root : process.cwd();
}

/** Database slot over `bun:sqlite`. One file, one process — `plumix/db/libsql` is the slot for a remote or shared database. */
export function bunSqlite(config: BunSqliteConfig): BunSqliteDatabaseAdapter {
  return {
    kind: "bun-sqlite",
    config,
    connect: (env, _request, schema) => {
      const client = openBunSqlite(databaseFile(config, projectRoot(env)));
      try {
        return {
          db: drizzleBunSqlite(client, schema),
          close: () => client.close(),
        };
      } catch (error) {
        // A malformed schema throws while drizzle reads it, and the handle is
        // already open with nothing left holding a reference to close it.
        client.close();
        throw error;
      }
    },
  };
}

export function isBunSqlite(adapter: {
  readonly kind: string;
}): adapter is BunSqliteDatabaseAdapter {
  return adapter.kind === "bun-sqlite";
}
