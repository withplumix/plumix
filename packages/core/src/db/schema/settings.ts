import { primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import type { JsonObject, JsonValue } from "../../json.js";

/**
 * Plugin authors go through the `settings.get`/`settings.upsert` RPC rather
 * than this table.
 */
export const settings = sqliteTable(
  "settings",
  (t) => ({
    group: t.text().notNull(),
    key: t.text().notNull(),
    // `settings.upsert` runs every value through the field pipeline, so what
    // lands here is decoded, not merely encodable.
    value: t.text({ mode: "json" }).$type<JsonValue>(),
  }),
  (table) => [primaryKey({ columns: [table.group, table.key] })],
);

/**
 * A settings group as the RPC hands it over: one flat `key → value` bag of
 * the `settings.value` column verbatim.
 */
export type SettingsBag = JsonObject;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export const settingInsertSchema = createInsertSchema(settings);
export const settingSelectSchema = createSelectSchema(settings);
