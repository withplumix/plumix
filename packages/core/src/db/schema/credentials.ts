import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const CREDENTIAL_DEVICE_TYPES = [
  "single_device",
  "multi_device",
] as const;

export type CredentialDeviceType = (typeof CREDENTIAL_DEVICE_TYPES)[number];

export type CredentialTransport = "usb" | "nfc" | "ble" | "internal" | "hybrid";

export const credentials = sqliteTable(
  "credentials",
  (t) => ({
    id: t.text().primaryKey(),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publicKey: t.blob({ mode: "buffer" }).notNull(),
    counter: t.integer().notNull().default(0),
    deviceType: t.text({ enum: CREDENTIAL_DEVICE_TYPES }).notNull(),
    isBackedUp: t.integer({ mode: "boolean" }).notNull().default(false),
    transports: t.text({ mode: "json" }).$type<CredentialTransport[]>(),
    name: t.text(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastUsedAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [index("credentials_user_id_idx").on(table.userId)],
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

export const credentialInsertSchema = createInsertSchema(credentials);
export const credentialSelectSchema = createSelectSchema(credentials);
