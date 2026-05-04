import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const ENTRY_STATUSES = [
  "draft",
  "published",
  "scheduled",
  "trash",
] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/**
 * ProseMirror / Tiptap document persisted in `entries.content`. Intentionally
 * loose — the editor owns the outgoing block vocabulary and the public
 * renderer's walker allowlists on the way out, so the column only needs
 * to agree that content is a JSON object.
 */
export type EntryContent = Record<string, unknown>;

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
    meta: t
      .text({ mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
