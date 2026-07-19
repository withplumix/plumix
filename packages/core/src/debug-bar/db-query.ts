import type { Logger } from "drizzle-orm";

import { tryGetContext } from "../context/stores.js";

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
 *
 * Driver-agnostic and free of any driver type import, so it can be shared with
 * runtime adapters (D1) over a narrow subpath without dragging libsql types in.
 */
export function createDebugSqlLogger(): Logger {
  return {
    logQuery(sql, params) {
      tryGetContext()?.debug.record(DB_PANEL_ID, { sql, params });
    },
  };
}
