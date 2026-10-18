import type { Db } from "../../../context/app-context.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import { claim, ConflictError, nextToken } from "../../../db/concurrency.js";
import { and, eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";

export const ENTRY_IF_MATCH_MESSAGE =
  "Send the entry's `etag` from `entry.get` as `ifMatch`";

/** Refuses a write whose copy the row has moved past since. */
export function assertCopyCurrent(ifMatch: Date, updatedAt: Date): void {
  if (ifMatch.getTime() !== updatedAt.getTime()) {
    throw new ConflictError(updatedAt);
  }
}

/**
 * One conditional update: it lands only while the row still holds `ifMatch`,
 * and moves the token. Throws `ConflictError` when another write landed first;
 * `undefined` when the entry is gone.
 */
export async function claimEntry(
  db: Db,
  id: number,
  ifMatch: Date,
  changes: Partial<NewEntry>,
): Promise<Entry | undefined> {
  const guard = claim(entries.updatedAt, ifMatch);
  const [row] = await db
    .update(entries)
    .set({ ...changes, ...guard.set })
    .where(and(eq(entries.id, id), guard.where))
    .returning();
  if (row) return row;
  const [current] = await db
    .select({ updatedAt: entries.updatedAt })
    .from(entries)
    .where(eq(entries.id, id));
  if (current) throw new ConflictError(current.updatedAt);
  return undefined;
}

/**
 * A system write: lands only while the row holds the token `decide` read, else
 * re-reads and decides again. `undefined` once the entry is gone.
 */
export async function writeAsSystem(
  db: Db,
  read: Entry,
  decide: (row: Entry) => Partial<NewEntry> | undefined,
): Promise<{ readonly row: Entry; readonly written: boolean } | undefined> {
  let row: Entry | undefined = read;
  while (row) {
    const changes = decide(row);
    if (changes === undefined) return { row, written: false };
    const [updated] = await db
      .update(entries)
      .set({ ...changes, updatedAt: nextToken(row.updatedAt, new Date()) })
      .where(and(eq(entries.id, row.id), eq(entries.updatedAt, row.updatedAt)))
      .returning();
    if (updated) return { row: updated, written: true };
    row = await db.query.entries.findFirst({ where: eq(entries.id, row.id) });
  }
  return undefined;
}
