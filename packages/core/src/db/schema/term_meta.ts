import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { terms } from "./terms.js";

export const termMeta = sqliteTable(
  "term_meta",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    termId: t
      .integer()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    key: t.text().notNull(),
    value: t.text().notNull(),
  }),
  (table) => [
    uniqueIndex("term_meta_term_id_key_idx").on(table.termId, table.key),
  ],
);

export type TermMeta = typeof termMeta.$inferSelect;
export type NewTermMeta = typeof termMeta.$inferInsert;

export const termMetaInsertSchema = createInsertSchema(termMeta);
export const termMetaSelectSchema = createSelectSchema(termMeta);
