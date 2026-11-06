import { sql } from "drizzle-orm";
import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import type { JsonObject } from "../../json.js";
import { now } from "../../clock.js";

export const users = sqliteTable(
  "users",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    email: t.text().notNull().unique(),
    // Stable after creation, so a name edit never breaks author permalinks.
    slug: t.text().notNull(),
    name: t.text(),
    avatarUrl: t.text(),
    // An undeclared role grants none. Every insert names a role, because
    // changing this default rebuilds the table, which drops D1 sessions.
    role: t.text().notNull().default("subscriber"),
    meta: t.text({ mode: "json" }).$type<JsonObject>().notNull().default({}),
    emailVerifiedAt: t.integer({ mode: "timestamp" }),
    disabledAt: t.integer({ mode: "timestamp" }),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      // The concurrency token: an update that doesn't set it still moves it,
      // past its own value when two writes share a second.
      .$onUpdate(
        () => sql`max(${Math.floor(now().getTime() / 1000)}, updated_at + 1)`,
      ),
  }),
  // Named unique index, mirroring `terms_taxonomy_slug_idx` /
  // `entries_type_slug_idx` — single-column since the slug is global.
  (table) => [uniqueIndex("users_slug_idx").on(table.slug)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const userInsertSchema = createInsertSchema(users);
export const userSelectSchema = createSelectSchema(users);
