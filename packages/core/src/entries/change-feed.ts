import type { Db } from "../context/app.js";
import type { EntryChangeKind } from "../db/schema/entry_changes.js";
import { asc, inArray } from "../db/index.js";
import { entryChanges } from "../db/schema/entry_changes.js";

// Cloudflare D1 caps bound parameters at 100 per statement and `inArray`
// binds one per id, so a whole drain in one statement works on local SQLite
// and dies in production.
const ACK_IDS_PER_STATEMENT = 100;

export interface EntryChange {
  /** Feed row id — the handle {@link ackEntryChanges} deletes by. */
  readonly id: number;
  readonly entryId: number;
  /** `delete` is a tombstone: the entry is gone and a consumer holding a
   *  projection of it should drop that projection. */
  readonly kind: EntryChangeKind;
}

/** Narrow enough that any drizzle db satisfies it, however a plugin has
 *  widened its schema — the feed's two accesses are all this needs. */
type ChangeFeedDb = Pick<Db, "select" | "delete">;

/**
 * Cost tracks the batch, not the corpus: the rows come back in primary-key
 * order off a limited scan, so a feed holding a full reindex drains at the
 * same rate as one holding a handful.
 *
 * An entry saved several times between drains appears once per save, so a
 * consumer collapsing the batch by `entryId` has to keep the highest `id` per
 * entry, not the first row it meets.
 *
 * `INSERT OR REPLACE` is the one write the feed cannot describe. With
 * `recursive_triggers` off — the default on D1 and libsql — the displaced row
 * fires no delete trigger, so the new row gets an `upsert` and the id it
 * replaced gets no tombstone. A consumer's projection of that id is stranded.
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
 * Deliberately separate from {@link readEntryChanges}, and deliberately by row
 * id: acknowledging after the work rather than before is what makes an isolate
 * that dies mid-drain leave its batch for the next one, and matching on ids
 * leaves a change enqueued since the read untouched.
 */
export async function ackEntryChanges(
  db: ChangeFeedDb,
  changes: readonly EntryChange[],
): Promise<void> {
  const ids = changes.map((change) => change.id);
  for (let i = 0; i < ids.length; i += ACK_IDS_PER_STATEMENT) {
    await db
      .delete(entryChanges)
      .where(inArray(entryChanges.id, ids.slice(i, i + ACK_IDS_PER_STATEMENT)));
  }
}
