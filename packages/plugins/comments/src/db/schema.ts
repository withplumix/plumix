import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { entries, users } from "plumix/schema";

import { COMMENT_STATUSES } from "../types.js";

/**
 * A comment on an entry. Author identity is snapshotted (name/email
 * captured at write time) so the row survives a user rename or delete —
 * `author_user_id` links a logged-in commenter but display never joins
 * live user data. `author_email` is private: it drives trust lookups,
 * Gravatar, and notifications but is never serialized into the public
 * payload. `ip_hash` is a salted SHA-256, never a cleartext address.
 */
export const comments = sqliteTable(
  "comments",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    entryId: t
      .integer()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    // Threading parent. Clamped at write time so stored depth never
    // exceeds the configured cap. Cascade is the entry-delete safety
    // net; comment-level deletes go through the service (tombstone in
    // #963), not raw cascade.
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
    meta: t
      .text({ mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
