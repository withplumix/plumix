import { sqliteTable } from "drizzle-orm/sqlite-core";

export const ENTRY_CHANGE_KINDS = ["upsert", "delete"] as const;

export type EntryChangeKind = (typeof ENTRY_CHANGE_KINDS)[number];

/**
 * Appended by triggers, so nothing can bypass it. No FK, or a cascade would
 * erase the tombstones; no index, since both accesses are primary-key ordered.
 */
export const entryChanges = sqliteTable("entry_changes", (t) => ({
  id: t.integer().primaryKey({ autoIncrement: true }),
  entryId: t.integer().notNull(),
  kind: t.text({ enum: ENTRY_CHANGE_KINDS }).notNull(),
}));
