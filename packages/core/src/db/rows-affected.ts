// A driver that says how many rows a write touched says it somewhere of
// its own: libsql on `rowsAffected`, D1 under `meta.changes`, and
// better-sqlite3 / node:sqlite / bun:sqlite on a top-level `changes`.
// Drizzle types a run result as `unknown` — `Db` is
// `BaseSQLiteDatabase<…, unknown, …>` — so the shape is read here rather
// than at every call site.
//
// Not every driver says it at all: the demo runtime's `sqlite-proxy`
// adapter answers every statement with `{ rows }` and nothing else. A
// caller with one of those has no count to read, which is what the throw
// below is for.

import { DbError } from "./errors.js";

/**
 * A driver's own result object, read one key at a time. Not JSON: it is
 * whatever the driver package constructed and handed back — a libsql
 * `ResultSet`, a D1 `D1Result` — so the shape is the driver's to change
 * and this file's to read, not something a schema describes.
 */
type DriverResult = Record<string, unknown>;

function asRecord(value: unknown): DriverResult | null {
  if (!value || typeof value !== "object") return null;
  return value as DriverResult;
}

/**
 * How many rows the write just run touched, whichever driver ran it —
 * the count `.returning()` otherwise makes a caller buy a row at a time.
 *
 * Throws when the result carries no count: a purge that logs zero rows
 * because nobody taught this function its driver is worse than one that
 * says so.
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
