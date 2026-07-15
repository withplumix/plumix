import type { DatabaseAdapter } from "plumix";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { DEMO_SHOWCASE_NAME, demoStub, readDemoToken } from "./session.js";

export interface DemoDatabaseConfig {
  /** DemoDB Durable Object namespace binding name. */
  readonly binding: string;
}

/**
 * Routes queries to a demo Durable Object: the visitor's own per-session DO
 * (from the session cookie), or the shared read-only showcase DO for
 * cookieless traffic. A drizzle `sqlite-proxy` driver RPCs each statement to
 * the DO's SQLite; the DO is migrated + seeded by the demo runtime before any
 * query runs, so `connect` only wires the proxy — it never migrates.
 */
export function demoDatabase(config: DemoDatabaseConfig): DatabaseAdapter {
  const { binding } = config;
  return {
    kind: "demo",
    requiredBindings: [binding],
    connect(env, request, schema) {
      const token = readDemoToken(request) ?? DEMO_SHOWCASE_NAME;
      const stub = demoStub(env, binding, token);
      // sqlite-proxy wants a single positional row for `get`, an array of them
      // otherwise; DemoDB.query/batch already return positional rows.
      const shape = (rows: SqlStorageValue[][], method: string) => {
        if (method !== "get") return rows;
        // `get` must yield `undefined` (not `[]`) on a miss, or drizzle's
        // `if (!row) return undefined` guard is defeated and it maps a phantom
        // row of `undefined` columns. The driver's callback type doesn't model
        // that `undefined`; narrowing it trips a rule that wants `!`, which the
        // repo bans — so assert here. drizzle handles the runtime `undefined`.
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        return rows.at(0) as SqlStorageValue[];
      };
      // NB: `drizzle(callback, batchCallback, config)` — the config (and thus
      // `casing`) is read only from the third argument, so the batch callback
      // must be passed even though it also, usefully, enables `db.batch()`.
      const db = drizzle(
        async (sqlText, params, method) => ({
          rows: shape((await stub.query(sqlText, params)).rows, method),
        }),
        async (queries) => {
          const results = await stub.batch(
            queries.map((q) => ({ sql: q.sql, params: q.params })),
          );
          return queries.map((query, i) => ({
            rows: shape(results[i]?.rows ?? [], query.method),
          }));
        },
        { schema, casing: "snake_case" },
      );
      return { db };
    },
  };
}
