import type { DatabaseAdapter, PlumixEnv } from "plumix";

import type { NodeSqliteDatabase } from "./node-sqlite-client.js";
import { drizzleNodeSqlite, openNodeSqlite } from "./node-sqlite-client.js";

export type { NodeSqliteDatabase } from "./node-sqlite-client.js";

export interface NodeSqliteConfig {
  /** Path of the SQLite file; parent directories are created on open. */
  readonly path: string;
}

export interface NodeSqliteDatabaseAdapter extends DatabaseAdapter {
  readonly config: NodeSqliteConfig;
  connect<TSchema extends Record<string, unknown>>(
    env: PlumixEnv,
    request: Request,
    schema: TSchema,
  ): { db: NodeSqliteDatabase<TSchema> };
}

/** Database slot over `node:sqlite`. One file, one process — `plumix/db/libsql` is the slot for a remote or shared database. */
export function nodeSqlite(
  config: NodeSqliteConfig,
): NodeSqliteDatabaseAdapter {
  return {
    kind: "node-sqlite",
    config,
    connect: (_env, _request, schema) => ({
      db: drizzleNodeSqlite(openNodeSqlite(config.path), schema),
    }),
  };
}

export function isNodeSqlite(adapter: {
  readonly kind: string;
}): adapter is NodeSqliteDatabaseAdapter {
  return adapter.kind === "node-sqlite";
}
