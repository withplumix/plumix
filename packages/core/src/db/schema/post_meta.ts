import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { posts } from "./posts.js";

export const postMeta = sqliteTable(
  "post_meta",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    postId: t
      .integer()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    key: t.text().notNull(),
    value: t.text().notNull(),
  }),
  (table) => [
    uniqueIndex("post_meta_post_id_key_idx").on(table.postId, table.key),
  ],
);

export type PostMeta = typeof postMeta.$inferSelect;
export type NewPostMeta = typeof postMeta.$inferInsert;

export const postMetaInsertSchema = createInsertSchema(postMeta);
export const postMetaSelectSchema = createSelectSchema(postMeta);
