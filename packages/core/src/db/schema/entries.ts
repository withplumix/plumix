import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import type { JsonObject } from "../../json.js";
import { users } from "./users.js";

export const ENTRY_STATUSES = [
  "draft",
  "published",
  "scheduled",
  "trash",
] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/**
 * The block envelope persisted in `entries.content` — `plumix.v2` today, a
 * pre-cutover Tiptap document on rows nobody has re-saved. Intentionally
 * loose — the editor owns the outgoing block vocabulary and the public
 * renderer's walker allowlists on the way out, so the column only needs
 * to agree that content is a JSON object.
 *
 * Not `JsonObject`, unlike `meta`. Both arrive off the wire as
 * `v.record(v.string(), v.unknown())`, but meta is written through the field
 * pipeline, which normalizes every value before `applyMetaPatch` encodes it;
 * content goes straight from the request into `.values()`. Narrowing the
 * column would only move the unproven claim to an assertion at the RPC
 * boundary.
 */
export type EntryContent = Record<string, unknown>;

/**
 * Carries the change-feed triggers in `entries/change-feed.ts`. drizzle emits
 * a table rebuild for some schema changes — adding a `NOT NULL` to an existing
 * column, for one — and every trigger on the table dies at the `DROP TABLE`
 * inside it. A migration that rebuilds this table has to re-create them under
 * a new `sqlMigrations` name — `ENTRY_CHANGE_FEED_RESET_DDL` is the statement
 * list to point it at.
 *
 * A new column that changes what a consumer's projection of an entry says —
 * its text, its visibility, its URL — belongs in that module's
 * `WATCHED_COLUMNS`, and reaches installs only through a further migration.
 */
export const entries = sqliteTable(
  "entries",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    type: t.text().notNull().default("post"),
    parentId: t.integer().references((): AnySQLiteColumn => entries.id, {
      onDelete: "set null",
    }),
    title: t.text().notNull(),
    slug: t.text().notNull(),
    content: t.text({ mode: "json" }).$type<EntryContent>(),
    excerpt: t.text(),
    status: t.text({ enum: ENTRY_STATUSES }).notNull().default("draft"),
    authorId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sortOrder: t.integer().notNull().default(0),
    meta: t.text({ mode: "json" }).$type<JsonObject>().notNull().default({}),
    publishedAt: t.integer({ mode: "timestamp" }),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => sql`(unixepoch())`),
  }),
  (table) => [
    uniqueIndex("entries_type_slug_idx").on(table.type, table.slug),
    index("entries_type_status_published_idx").on(
      table.type,
      table.status,
      table.publishedAt,
    ),
    index("entries_author_id_idx").on(table.authorId),
    // Composite covers both `WHERE parent_id = ?` lookups (prefix scan) and
    // the menu/page-tree resolver's `ORDER BY parent_id, sort_order`. A
    // separate single-column index on parent_id would be redundant.
    index("entries_parent_id_sort_order_idx").on(
      table.parentId,
      table.sortOrder,
    ),
  ],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;

export const entryInsertSchema = createInsertSchema(entries);
export const entrySelectSchema = createSelectSchema(entries);
