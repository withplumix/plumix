import { primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

// One row per field within a registered settings group. `group` matches
// the name passed to `ctx.registerSettingsGroup`; plugin authors read /
// write through the RPC (`settings.get({ group })` / `settings.upsert`)
// rather than touching this table directly. Stored values are JSON —
// the registered field's `type` drives encoding on the way in and
// decoding on the way out.
export const settings = sqliteTable(
  "settings",
  (t) => ({
    group: t.text().notNull(),
    key: t.text().notNull(),
    value: t.text({ mode: "json" }).$type<unknown>(),
  }),
  (table) => [primaryKey({ columns: [table.group, table.key] })],
);

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export const settingInsertSchema = createInsertSchema(settings);
export const settingSelectSchema = createSelectSchema(settings);
