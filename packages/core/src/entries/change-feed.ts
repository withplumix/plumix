import type { Db } from "../context/app.js";
import type { EntryChangeKind } from "../db/schema/entry_changes.js";
import { asc, inArray } from "../db/index.js";
import { entryChanges } from "../db/schema/entry_changes.js";

// Not `updated_at`: drizzle bumps it on every save, so watching it would put
// every metadata-only write on the feed.
const WATCHED_COLUMNS = ["title", "content", "excerpt", "status"] as const;

const GUARD = WATCHED_COLUMNS.map(
  // `IS NOT` rather than `<>`: SQLite's null-propagating comparison would make
  // clearing an excerpt, or setting one for the first time, read as unchanged.
  (column) => `old.${column} IS NOT new.${column}`,
).join("\n    OR ");

/**
 * The DDL drizzle cannot express, shipped as a core raw SQL migration and
 * applied to every test database. One statement per entry — the callers that
 * apply these run them one at a time.
 *
 * These triggers live on core's own `entries` table on purpose. drizzle emits
 * a table rebuild for ordinary schema changes — `CREATE TABLE __new_entries` /
 * `DROP TABLE entries` / rename — and every trigger on the table dies at that
 * `DROP`. A plugin's triggers would be destroyed by a core migration whose
 * author had no way to know they existed, and the feed would stop receiving
 * rows with nothing to notice it.
 */
export const ENTRY_CHANGE_FEED_DDL: readonly string[] = [
  `CREATE TRIGGER entries_change_feed_insert AFTER INSERT ON entries
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END`,
  `CREATE TRIGGER entries_change_feed_update AFTER UPDATE ON entries
  WHEN ${GUARD}
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END`,
  `CREATE TRIGGER entries_change_feed_delete AFTER DELETE ON entries
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (old.id, 'delete');
  END`,
];

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
 * An entry saved several times between drains appears once per save, and an
 * `INSERT OR REPLACE` puts a `delete` ahead of the `upsert` for one entry. A
 * consumer collapsing the batch by `entryId` therefore has to keep the
 * highest `id` per entry, not the first row it meets.
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

// Cloudflare D1 caps bound parameters at 100 per statement and `inArray`
// binds one per id, so a whole drain in one statement works on local SQLite
// and dies in production.
const ACK_IDS_PER_STATEMENT = 100;
