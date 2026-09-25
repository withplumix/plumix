import type { Db } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { Entry } from "../db/schema/entries.js";
import { and, eq, inArray, notInArray, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { isReservedType, RESERVED_TYPES } from "../revisions/slug-codec.js";

// Revisions and autosaves are rows in `entries` too, under types the editor
// owns. Everything outside `revisions/` asks this module what an entry is, so
// no reader has to remember those rows exist.

/** Whether a type name names authored entries rather than editor history. */
export function isAuthoredEntryType(type: string): boolean {
  return !isReservedType(type);
}

/**
 * The authored entries, as a WHERE clause. Parenthesized, so it can be
 * `AND`ed onto a caller's own predicate.
 */
export function authoredEntryRows(): SQL {
  return sql`(${notInArray(entries.type, [...RESERVED_TYPES])})`;
}

/**
 * The authored entry with this id, or `undefined` — for a missing id and a
 * revision or autosave id alike, so a caller answers both with one not-found.
 */
export async function loadAuthoredEntry(
  db: Db,
  id: number,
): Promise<Entry | undefined> {
  return db.query.entries.findFirst({
    where: and(eq(entries.id, id), authoredEntryRows()),
  });
}

/**
 * The authored entries among `ids`, in one `WHERE id IN (…)`. An id that is
 * missing or reserved is simply absent, so a caller that fails the whole batch
 * on a missing id fails it on a reserved one too.
 */
export async function loadAuthoredEntries(
  db: Db,
  ids: readonly number[],
): Promise<Entry[]> {
  return db.query.entries.findMany({
    where: and(inArray(entries.id, [...ids]), authoredEntryRows()),
  });
}
