import { sql } from "drizzle-orm";
import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import type { JsonObject } from "../../json.js";

export const USER_ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const users = sqliteTable(
  "users",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    email: t.text().notNull().unique(),
    // Stable after creation, so a name edit never breaks author permalinks.
    slug: t.text().notNull(),
    name: t.text(),
    avatarUrl: t.text(),
    role: t.text({ enum: USER_ROLES }).notNull().default("subscriber"),
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
      .$onUpdate(() => sql`(unixepoch())`),
  }),
  // Named unique index, mirroring `terms_taxonomy_slug_idx` /
  // `entries_type_slug_idx` — single-column since the slug is global.
  (table) => [uniqueIndex("users_slug_idx").on(table.slug)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const userInsertSchema = createInsertSchema(users);
export const userSelectSchema = createSelectSchema(users);
