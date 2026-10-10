import type { PlumixEnv } from "plumix";
import type { DatabaseAdapter, SchemaModule } from "plumix/runtime";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { traceDbBatch, traceDbQuery } from "plumix/runtime";

import { DEMO_SHOWCASE_NAME, demoStub, readDemoToken } from "./session.js";

export interface DemoDatabaseConfig {
  /** DemoDB Durable Object namespace binding name. */
  readonly binding: string;
}

/**
 * The demo runtime migrates and seeds each DO before any query, so `connect`
 * never migrates.
 */
export function demoDatabase(config: DemoDatabaseConfig): DatabaseAdapter {
  const { binding } = config;
  // Every visitor has their own DO, so routing varies per request.
  const connect = (
    env: PlumixEnv,
    request: Request,
    schema: SchemaModule,
  ): { db: unknown } => {
    const token = readDemoToken(request) ?? DEMO_SHOWCASE_NAME;
    const stub = demoStub(env, binding, token);
    // sqlite-proxy wants a single positional row for `get`, an array of them
    // otherwise; DemoDB.query/batch already return positional rows.
    const shape = (rows: SqlStorageValue[][], method: string) => {
      if (method !== "get") return rows;
      // `undefined` (not `[]`) on a miss, or drizzle maps a phantom row. The callback type doesn't
      // model it, and the repo bans `!`.
      // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
      return rows.at(0) as SqlStorageValue[];
    };
    // NB: `drizzle(callback, batchCallback, config)` — the config (and thus
    // `casing`) is read only from the third argument, so the batch callback
    // must be passed even though it also, usefully, enables `db.batch()`.
    const db = drizzle(
      async (sqlText, params, method) => {
        const result = await traceDbQuery(
          { sql: sqlText, params },
          () => stub.query(sqlText, params),
          (r) => r.rows.length,
        );
        return { rows: shape(result.rows, method) };
      },
      async (queries) => {
        const results = await traceDbBatch(
          queries,
          () =>
            stub.batch(queries.map((q) => ({ sql: q.sql, params: q.params }))),
          (result: { rows: SqlStorageValue[][] }) => result.rows.length,
        );
        return queries.map((query, i) => ({
          rows: shape(results[i]?.rows ?? [], query.method),
        }));
      },
      { schema, casing: "snake_case" },
    );
    return { db };
  };

  return {
    kind: "demo",
    requiredBindings: [binding],
    connect,
    connectRequest: ({ env, request, schema }) => ({
      db: connect(env, request, schema).db,
      commit: (response) => response,
    }),
  };
}
