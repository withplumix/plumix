import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const sessions = sqliteTable(
  "sessions",
  (t) => ({
    id: t.text().primaryKey(),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: t.integer({ mode: "timestamp" }).notNull(),
    ipAddress: t.text(),
    userAgent: t.text(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export const sessionInsertSchema = createInsertSchema(sessions);
export const sessionSelectSchema = createSelectSchema(sessions);
