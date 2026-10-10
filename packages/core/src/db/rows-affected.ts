// Each driver reports the count somewhere of its own, and drizzle types the
// run result as `unknown`. The demo's `sqlite-proxy` reports none.

import { DbError } from "./errors.js";

/**
 * Not JSON: whatever the driver package constructed, a libsql `ResultSet` or a
 * D1 `D1Result`.
 */
type DriverResult = Record<string, unknown>;

function asRecord(value: unknown): DriverResult | null {
  if (!value || typeof value !== "object") return null;
  return value as DriverResult;
}

/**
 * Throws when the result carries no count: a purge silently logging zero rows
 * is worse than one that says so.
 */
export function rowsAffected(result: unknown): number {
  const bag = asRecord(result);
  if (typeof bag?.rowsAffected === "number") return bag.rowsAffected;
  // Safe beside the two below: libsql's result set has no `changes` at
  // all, and D1 keeps its own under `meta`.
  if (typeof bag?.changes === "number") return bag.changes;

  const nested = asRecord(bag?.meta)?.changes;
  if (typeof nested === "number") return nested;

  throw DbError.noRowCount(["rowsAffected", "changes", "meta.changes"]);
}
