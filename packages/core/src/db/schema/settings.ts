import { primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import type { JsonObject, JsonValue } from "../../json.js";

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
    // Same contract as the `meta` columns: `settings.upsert` runs every
    // value through the field pipeline — a registered field's declared type
    // for the keys it owns, a JSON decode for the rest — so what lands here
    // is decoded, not merely encodable.
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
