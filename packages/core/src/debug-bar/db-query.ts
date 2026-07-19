import type { Client, InStatement } from "@libsql/client";
import type { Logger } from "drizzle-orm";

import { tryGetContext } from "../context/stores.js";
import { queryKind } from "./highlight-sql.js";

/** Panel id + collector namespace for database queries. */
export const DB_PANEL_ID = "database";

export interface DbQueryEntry {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * A drizzle `Logger` that feeds the Database panel. Pass it as the `logger`
 * option to `drizzle(...)` (dev-gated) — one uniform mechanism across every
 * driver, giving the `?`-form SQL plus the bound params. It reaches the
 * request's collector via the request-store ALS, so it's a no-op outside a
 * request (and in prod, where `ctx.debug` is the no-op collector). Per-query
 * timing is not part of drizzle's logger contract; the Timeline panel measures
 * it via spans instead.
 */
export function createDebugSqlLogger(): Logger {
  return {
    logQuery(sql, params) {
      tryGetContext()?.debug.record(DB_PANEL_ID, { sql, params });
    },
  };
}

/**
 * Wraps a libsql client so every `execute` runs inside a timed `ctx.debug.span`
 * — the Timeline panel's source of per-query durations, which drizzle's logger
 * contract can't provide. Dev-only (call it behind the `PLUMIX_DEV` gate); a
 * no-op outside a request, and tree-shaken from prod along with its callers.
 *
 * Assumes drizzle's single-argument call convention (`execute(stmt)`,
 * `batch(stmts)`); it forwards only that first argument, so a direct
 * `execute(sql, args)` call would drop its params. Queries inside a drizzle
 * transaction run through `tx.execute` and aren't timed — acceptable for a dev
 * panel.
 */
export function traceSqlClient(client: Client): Client {
  const stmtSql = (stmt: InStatement): string =>
    typeof stmt === "string" ? stmt : stmt.sql;

  const rawExecute = client.execute.bind(client);
  client.execute = (stmt: InStatement) => {
    const ctx = tryGetContext();
    const run = (): ReturnType<typeof rawExecute> => rawExecute(stmt);
    if (!ctx) return run();
    return ctx.debug.span(`db: ${queryKind(stmtSql(stmt))}`, run);
  };

  // Relational reads and transactions run as one batched round-trip; time the
  // whole batch as a single span (labelled by kind when uniform).
  const rawBatch = client.batch.bind(client);
  client.batch = (stmts: InStatement[], ...rest: unknown[]) => {
    const ctx = tryGetContext();
    const run = (): ReturnType<typeof rawBatch> =>
      rawBatch(stmts, ...(rest as never[]));
    if (!ctx || !Array.isArray(stmts)) return run();
    const kinds = new Set(stmts.map((stmt) => queryKind(stmtSql(stmt))));
    const label = kinds.size === 1 ? `db: ${[...kinds][0]}` : "db: batch";
    return ctx.debug.span(`${label} (${stmts.length})`, run);
  };

  return client;
}
