import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { index, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import type { JsonObject } from "../../json.js";

export const terms = sqliteTable(
  "terms",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    taxonomy: t.text().notNull(),
    name: t.text().notNull(),
    slug: t.text().notNull(),
    description: t.text(),
    meta: t.text({ mode: "json" }).$type<JsonObject>().notNull().default({}),
    parentId: t.integer().references((): AnySQLiteColumn => terms.id, {
      onDelete: "set null",
    }),
    // The concurrency token (ADR 0048): an update that doesn't set it still
    // moves it by one.
    version: t
      .integer()
      .notNull()
      .default(0)
      .$onUpdate(() => sql`version + 1`),
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
