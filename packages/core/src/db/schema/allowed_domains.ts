import { sql } from "drizzle-orm";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { USER_ROLES } from "./users.js";

export const allowedDomains = sqliteTable("allowed_domains", (t) => ({
  domain: t.text().primaryKey(),
  defaultRole: t.text({ enum: USER_ROLES }).notNull().default("subscriber"),
  isEnabled: t.integer({ mode: "boolean" }).notNull().default(true),
  createdAt: t
    .integer({ mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}));

export type AllowedDomain = typeof allowedDomains.$inferSelect;
export type NewAllowedDomain = typeof allowedDomains.$inferInsert;

export const allowedDomainInsertSchema = createInsertSchema(allowedDomains);
export const allowedDomainSelectSchema = createSelectSchema(allowedDomains);
