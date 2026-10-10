import type { Db } from "../context/app-context.js";
import type { EntryChangeKind } from "../db/schema/entry_changes.js";
import { asc, chunkForD1, inArray } from "../db/index.js";
import { entryChanges } from "../db/schema/entry_changes.js";

export interface EntryChange {
  /** Feed row id — the handle {@link ackEntryChanges} deletes by. */
  readonly id: number;
  readonly entryId: number;
  /** `delete` is a tombstone: the entry is gone and a consumer holding a
   *  projection of it should drop that projection. */
  readonly kind: EntryChangeKind;
}

/**
 * Narrow enough that any drizzle db satisfies it, however a plugin widened
 * its schema.
 */
type ChangeFeedDb = Pick<Db, "select" | "delete">;

/**
 * An entry saved several times appears once per save; collapse by keeping the
 * highest `id`. `INSERT OR REPLACE` leaves the replaced id without a tombstone.
 */
export function readEntryChanges(
  db: ChangeFeedDb,
  limit: number,
): Promise<EntryChange[]> {
  return db
    .select({
      id: entryChanges.id,
      entryId: entryChanges.entryId,
      kind: entryChanges.kind,
    })
    .from(entryChanges)
    .orderBy(asc(entryChanges.id))
    .limit(limit);
}

/**
 * Ack after the work, by row id: an isolate dying mid-drain leaves its batch,
 * and changes enqueued since the read stay untouched.
 */
export async function ackEntryChanges(
  db: ChangeFeedDb,
  changes: readonly EntryChange[],
): Promise<void> {
  const ids = changes.map((change) => change.id);
  for (const chunk of chunkForD1(ids)) {
    await db.delete(entryChanges).where(inArray(entryChanges.id, chunk));
  }
}
