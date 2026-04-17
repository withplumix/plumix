import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const userMeta = sqliteTable(
  "user_meta",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: t.text().notNull(),
    value: t.text().notNull(),
  }),
  (table) => [
    uniqueIndex("user_meta_user_id_key_idx").on(table.userId, table.key),
  ],
);

export type UserMeta = typeof userMeta.$inferSelect;
export type NewUserMeta = typeof userMeta.$inferInsert;

export const userMetaInsertSchema = createInsertSchema(userMeta);
export const userMetaSelectSchema = createSelectSchema(userMeta);
