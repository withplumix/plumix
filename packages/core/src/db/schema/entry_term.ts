import { index, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { entries } from "./entries.js";
import { terms } from "./terms.js";

export const entryTerm = sqliteTable(
  "entry_term",
  (t) => ({
    entryId: t
      .integer()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    termId: t
      .integer()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    sortOrder: t.integer().notNull().default(0),
  }),
  (table) => [
    primaryKey({ columns: [table.entryId, table.termId] }),
    index("entry_term_term_id_idx").on(table.termId),
  ],
);

export type EntryTerm = typeof entryTerm.$inferSelect;
export type NewEntryTerm = typeof entryTerm.$inferInsert;

export const entryTermInsertSchema = createInsertSchema(entryTerm);
export const entryTermSelectSchema = createSelectSchema(entryTerm);
