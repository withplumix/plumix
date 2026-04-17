import { index, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { posts } from "./posts.js";
import { terms } from "./terms.js";

export const postTerm = sqliteTable(
  "post_term",
  (t) => ({
    postId: t
      .integer()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    termId: t
      .integer()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    sortOrder: t.integer().notNull().default(0),
  }),
  (table) => [
    primaryKey({ columns: [table.postId, table.termId] }),
    index("post_term_term_id_idx").on(table.termId),
  ],
);

export type PostTerm = typeof postTerm.$inferSelect;
export type NewPostTerm = typeof postTerm.$inferInsert;

export const postTermInsertSchema = createInsertSchema(postTerm);
export const postTermSelectSchema = createSelectSchema(postTerm);
