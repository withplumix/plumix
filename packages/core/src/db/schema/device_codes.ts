import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const DEVICE_CODE_STATUSES = ["pending", "approved", "denied"] as const;
export type DeviceCodeStatus = (typeof DEVICE_CODE_STATUSES)[number];

/**
 * RFC 8628 device grant. `id` is SHA-256(device_code), so a DB leak isn't a
 * secret leak. `userCode` stays plaintext: low-entropy by design, and approval
 * needs an authenticated session.
 */
export const deviceCodes = sqliteTable(
  "device_codes",
  (t) => ({
    /** SHA-256 hex of the raw device_code. PK = O(1) lookup on poll. */
    id: t.text().primaryKey(),
    /**
     * What the human types into `/auth/device`. `ABCD-EFGH`-shaped,
     * unambiguous-alphabet (no 0/O/1/I). Unique constraint protects
     * against a user_code collision during the brief TTL window.
     */
    userCode: t.text().notNull().unique(),
    /**
     * Set on approval. Cascades with the user (if the approver is
     * deleted before exchange, the row goes too). Always null while
     * status is "pending" or "denied".
     */
    userId: t.integer().references(() => users.id, { onDelete: "cascade" }),
    status: t.text({ enum: DEVICE_CODE_STATUSES }).notNull().default("pending"),
    /**
     * Human-set name for the api_tokens row that gets minted on
     * exchange. Captured during approval so the CLI shows up under
     * the approver's chosen label rather than a generic "CLI".
     */
    tokenName: t.text(),
    /**
     * Capability scope whitelist set at approval time. null =
     * unrestricted (inherits the approver's role caps). Non-null
     * array = the minted api_tokens row carries this list. Same
     * semantics as `api_tokens.scopes`.
     */
    scopes: t.text({ mode: "json" }).$type<readonly string[]>(),
    /**
     * RFC 8628 §3.5 default 600s. Past this the polling client gets
     * `expired_token`.
     */
    expiresAt: t.integer({ mode: "timestamp" }).notNull(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    // SQLite doesn't auto-index FK columns, so the cascade would full-scan
    // without `user_id`'s index.
    index("device_codes_expires_at_idx").on(table.expiresAt),
    index("device_codes_user_id_idx").on(table.userId),
  ],
);

export type DeviceCode = typeof deviceCodes.$inferSelect;
export type NewDeviceCode = typeof deviceCodes.$inferInsert;

export const deviceCodeInsertSchema = createInsertSchema(deviceCodes);
export const deviceCodeSelectSchema = createSelectSchema(deviceCodes);
