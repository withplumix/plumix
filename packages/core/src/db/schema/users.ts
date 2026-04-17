import { sql } from "drizzle-orm";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

export const USER_ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const users = sqliteTable("users", (t) => ({
  id: t.integer().primaryKey({ autoIncrement: true }),
  email: t.text().notNull().unique(),
  name: t.text(),
  avatarUrl: t.text(),
  role: t.text({ enum: USER_ROLES }).notNull().default("subscriber"),
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
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const userInsertSchema = createInsertSchema(users);
export const userSelectSchema = createSelectSchema(users);
