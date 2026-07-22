import type { Client, InStatement } from "@libsql/client";

import { tryGetContext } from "../context/stores.js";
import { queryKind } from "./highlight-sql.js";

/**
 * Wraps a libsql client so every `execute` runs inside a timed `ctx.telemetry.span`
 * — the Timeline panel's source of per-query durations, which drizzle's logger
 * contract can't provide. Dev-only (call it behind the `PLUMIX_DEV` gate); a
 * no-op outside a request, and tree-shaken from prod along with its callers.
 *
 * Lives apart from the driver-agnostic query logger so the libsql type import
 * stays out of adapters that don't use libsql (e.g. the D1 runtime).
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
    return ctx.telemetry.span(`db: ${queryKind(stmtSql(stmt))}`, run);
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
    return ctx.telemetry.span(`${label} (${stmts.length})`, run);
  };

  return client;
}
