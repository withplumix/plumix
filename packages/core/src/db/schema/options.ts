import { sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

export const options = sqliteTable("options", (t) => ({
  name: t.text().primaryKey(),
  value: t.text().notNull(),
  isAutoloaded: t.integer({ mode: "boolean" }).notNull().default(true),
}));

export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;

export const optionInsertSchema = createInsertSchema(options);
export const optionSelectSchema = createSelectSchema(options);
