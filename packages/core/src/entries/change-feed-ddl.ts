import { RESERVED_TYPES } from "../revisions/slug-codec.js";

// The columns that change what a consumer's projection of an entry says: its
// text, whether it is public, and its identity — `type`, `slug` and
// `parent_id` between them decide the permalink, the template, and whether
// search indexes it at all.
//
// `meta` is here because a field can declare itself searchable, so the bag is
// projected text like any other. It is watched whether or not a site has such
// a field: the trigger is one definition on core's table and cannot ask what
// some plugin's roster says today, and a consumer reading a bag it projects
// nothing from writes nothing.
//
// Not `updated_at`: drizzle bumps it on every save, so watching it would put
// every write on the feed, metadata-only ones included.
const WATCHED_COLUMNS = [
  "title",
  "content",
  "excerpt",
  "status",
  "type",
  "slug",
  "parent_id",
  "meta",
] as const;

const CHANGED = WATCHED_COLUMNS.map(
  // `IS NOT` rather than `<>`: SQLite's null-propagating comparison would make
  // clearing an excerpt, or setting one for the first time, read as unchanged.
  (column) => `old.${column} IS NOT new.${column}`,
).join("\n      OR ");

const RESERVED = RESERVED_TYPES.map((type) => `'${type}'`).join(", ");

// A revision and an autosave are rows in `entries` too. Their ids are not a
// document's, so a consumer resolving one gets a snapshot rather than the
// entry — and an autosave rewrites on every debounced save in the editor.
// Filtered here rather than downstream because a tombstone carries only an
// id: once the row is gone, no consumer can tell a pruned revision from a
// deleted entry.
function isContentRow(row: "new" | "old"): string {
  return `${row}.type NOT IN (${RESERVED})`;
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
  WHEN ${isContentRow("new")}
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END`,
  `CREATE TRIGGER entries_change_feed_update AFTER UPDATE ON entries
  WHEN ${isContentRow("new")}
    AND (${CHANGED})
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (new.id, 'upsert');
  END`,
  `CREATE TRIGGER entries_change_feed_delete AFTER DELETE ON entries
  WHEN ${isContentRow("old")}
  BEGIN
    INSERT INTO entry_changes (entry_id, kind) VALUES (old.id, 'delete');
  END`,
];

/**
 * Replaces triggers an install already has, and is emitted again under a new
 * name whenever their definition moves. A migration already in the journal is
 * never re-emitted, so a correction — the reserved-type guard, then `meta`
 * joining the watched columns — takes another entry in
 * `cli/raw-migrations.ts`. An install generating them all for the first time
 * converges on the same three triggers.
 */
export const ENTRY_CHANGE_FEED_RESET_DDL: readonly string[] = [
  "DROP TRIGGER IF EXISTS entries_change_feed_insert",
  "DROP TRIGGER IF EXISTS entries_change_feed_update",
  "DROP TRIGGER IF EXISTS entries_change_feed_delete",
  ...ENTRY_CHANGE_FEED_DDL,
];
