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
    content: t.text(),
    excerpt: t.text(),
    status: t.text({ enum: POST_STATUSES }).notNull().default("draft"),
    authorId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    menuOrder: t.integer().notNull().default(0),
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

/**
 * `Post` row plus its decoded meta bag. Returned by `post.get` /
 * `post.create` / `post.update` so the editor can render meta boxes in
 * one round-trip. Values are `unknown` — per-key types are driven by
 * the plugin registry (`MetaScalarType`) and coerced on read.
 */
export type PostWithMeta = Post & {
  readonly meta: Readonly<Record<string, unknown>>;
};

export const postInsertSchema = createInsertSchema(posts);
export const postSelectSchema = createSelectSchema(posts);
