import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const POST_STATUSES = [
  "draft",
  "published",
  "scheduled",
  "trash",
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * ProseMirror / Tiptap document persisted in `posts.content`. Intentionally
 * loose — the editor owns the outgoing block vocabulary and the public
 * renderer's walker allowlists on the way out, so the column only needs
 * to agree that content is a JSON object.
 */
export type PostContent = Record<string, unknown>;

export const posts = sqliteTable(
  "posts",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    type: t.text().notNull().default("post"),
    parentId: t.integer().references((): AnySQLiteColumn => posts.id, {
      onDelete: "set null",
    }),
    title: t.text().notNull(),
    slug: t.text().notNull(),
    content: t.text({ mode: "json" }).$type<PostContent>(),
    excerpt: t.text(),
    status: t.text({ enum: POST_STATUSES }).notNull().default("draft"),
    authorId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    menuOrder: t.integer().notNull().default(0),
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
    uniqueIndex("posts_type_slug_idx").on(table.type, table.slug),
    index("posts_type_status_published_idx").on(
      table.type,
      table.status,
      table.publishedAt,
    ),
    index("posts_author_id_idx").on(table.authorId),
    index("posts_parent_id_idx").on(table.parentId),
  ],
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export const postInsertSchema = createInsertSchema(posts);
export const postSelectSchema = createSelectSchema(posts);
