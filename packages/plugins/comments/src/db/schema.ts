import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { JsonObject } from "plumix";
import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { entries, users } from "plumix/schema";

import { COMMENT_STATUSES } from "../types.js";

/**
 * Author identity is snapshotted at write time so the row survives a user
 * rename or delete. `author_email` is never serialized publicly; `ip_hash` is a
 * salted SHA-256.
 */
export const comments = sqliteTable(
  "comments",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    entryId: t
      .integer()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    // Clamped at write time so stored depth never exceeds the configured cap.
    // Comment-level deletes go through the service, not this cascade.
    parentId: t
      .integer()
      .references((): AnySQLiteColumn => comments.id, { onDelete: "cascade" }),
    status: t.text({ enum: COMMENT_STATUSES }).notNull().default("pending"),
    authorUserId: t
      .integer()
      .references(() => users.id, { onDelete: "set null" }),
    authorName: t.text().notNull(),
    authorEmail: t.text().notNull(),
    bodyMd: t.text().notNull(),
    ipHash: t.text(),
    userAgent: t.text(),
    meta: t.text({ mode: "json" }).$type<JsonObject>().notNull().default({}),
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
    // The thread query: roots + status for one entry, newest-first.
    index("comments_entry_status_created_idx").on(
      table.entryId,
      table.status,
      table.createdAt,
    ),
    // Descendant walking in the recursive CTE.
    index("comments_parent_id_idx").on(table.parentId),
    // The moderation queue: one status tab, newest-first.
    index("comments_status_created_idx").on(table.status, table.createdAt),
    // Trust lookup ("has this email a prior approved comment?").
    index("comments_author_email_idx").on(table.authorEmail),
    index("comments_author_user_id_idx").on(table.authorUserId),
  ],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
