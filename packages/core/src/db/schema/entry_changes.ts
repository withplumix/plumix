import { sqliteTable } from "drizzle-orm/sqlite-core";

export const ENTRY_CHANGE_KINDS = ["upsert", "delete"] as const;

export type EntryChangeKind = (typeof ENTRY_CHANGE_KINDS)[number];

/**
 * The durable record of which entries changed, appended by the triggers in
 * `entries/change-feed.ts` rather than by application code, so a seed, a
 * migration or a direct-write plugin cannot bypass it.
 *
 * No foreign key to `entries`: a `delete` row is a tombstone for an entry
 * that no longer exists, and a cascade would erase the very row a consumer
 * needs in order to drop it from its index.
 *
 * No index either. Both accesses are primary-key ordered — a consumer reads
 * the oldest rows and then deletes the ones it handled by id — so a
 * secondary index would only add write cost to a table on the hot path of
 * every entry write.
 */
export const entryChanges = sqliteTable("entry_changes", (t) => ({
  id: t.integer().primaryKey({ autoIncrement: true }),
  entryId: t.integer().notNull(),
  kind: t.text({ enum: ENTRY_CHANGE_KINDS }).notNull(),
}));
