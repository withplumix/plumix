import type { Db } from "../context/app.js";
import type { EntryChangeKind } from "../db/schema/entry_changes.js";
import { asc, inArray } from "../db/index.js";
import { entryChanges } from "../db/schema/entry_changes.js";
import { AUTOSAVE_TYPE, REVISION_TYPE } from "../revisions/slug-codec.js";

// Not `updated_at`: drizzle bumps it on every save, so watching it would put
// every metadata-only write on the feed.
const WATCHED_COLUMNS = ["title", "content", "excerpt", "status"] as const;

const CHANGED = WATCHED_COLUMNS.map(
  // `IS NOT` rather than `<>`: SQLite's null-propagating comparison would make
  // clearing an excerpt, or setting one for the first time, read as unchanged.
  (column) => `old.${column} IS NOT new.${column}`,
).join("\n      OR ");

// A revision and an autosave are rows in `entries` too. Their ids are not a
// document's, so a consumer resolving one gets a snapshot rather than the
// entry — and an autosave rewrites on every debounced save in the editor.
// Filtered here rather than downstream because a tombstone carries only an
// id: once the row is gone, no consumer can tell a pruned revision from a
// deleted entry.
function contentRow(row: "new" | "old"): string {
  const reserved = [REVISION_TYPE, AUTOSAVE_TYPE]
    .map((type) => `'${type}'`)
    .join(", ");
  return `${row}.type NOT IN (${reserved})`;
}

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
  WHEN ${contentRow("new")}
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END`,
  `CREATE TRIGGER entries_change_feed_update AFTER UPDATE ON entries
  WHEN ${contentRow("new")}
    AND (${CHANGED})
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END`,
  `CREATE TRIGGER entries_change_feed_delete AFTER DELETE ON entries
  WHEN ${contentRow("old")}
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (old.id, 'delete');
  END`,
];

/**
 * Replaces triggers an install already has. The first migration shipped
 * without the reserved-type guard, and a migration in the journal is never
 * re-emitted, so correcting it takes a second one. Idempotent by
 * construction: an install generating both for the first time creates the
 * current triggers, drops them, and creates them again.
 */
export const ENTRY_CHANGE_FEED_RESET_DDL: readonly string[] = [
  "DROP TRIGGER IF EXISTS entries_change_feed_insert",
  "DROP TRIGGER IF EXISTS entries_change_feed_update",
  "DROP TRIGGER IF EXISTS entries_change_feed_delete",
  ...ENTRY_CHANGE_FEED_DDL,
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
