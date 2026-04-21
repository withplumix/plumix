import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { index, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

export const terms = sqliteTable(
  "terms",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    taxonomy: t.text().notNull(),
    name: t.text().notNull(),
    slug: t.text().notNull(),
    description: t.text(),
    meta: t
      .text({ mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    parentId: t.integer().references((): AnySQLiteColumn => terms.id, {
      onDelete: "set null",
    }),
  }),
  (table) => [
    uniqueIndex("terms_taxonomy_slug_idx").on(table.taxonomy, table.slug),
    index("terms_parent_id_idx").on(table.parentId),
  ],
);

export type Term = typeof terms.$inferSelect;
export type NewTerm = typeof terms.$inferInsert;

export const termInsertSchema = createInsertSchema(terms);
export const termSelectSchema = createSelectSchema(terms);
