import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const DEVICE_CODE_STATUSES = ["pending", "approved", "denied"] as const;
export type DeviceCodeStatus = (typeof DEVICE_CODE_STATUSES)[number];

// OAuth 2.0 Device Authorization Grant rows (RFC 8628). Distinct from
// `auth_tokens` (single-use, consume-then-delete: invites, magic links,
// PKCE state) — device flow has its own lifecycle: pending → approved
// → exchanged-then-deleted, with separate human-typed and machine-polled
// secrets.
//
// Storage shape, Copenhagen Book §"Token storage" aligned:
//   id        = SHA-256(device_code)        — PK; the actual secret is
//                                             never stored at rest.
//   userCode  = "ABCD-EFGH" (plaintext)     — 30-bit, indexed for the
//                                             admin's lookup-by-typed-code
//                                             path. Plaintext is OK
//                                             because (a) it's already
//                                             low-entropy by design and
//                                             (b) approval requires an
//                                             authenticated browser
//                                             session, so a leaked
//                                             user_code without that
//                                             session is useless.
//   userId    = null until approved         — also flips the row from
//                                             "pending" to "approved"
//                                             on the polling client's
//                                             next exchange.
//   tokenName = approver-chosen name        — applied to the minted
//                                             api_tokens row when the
//                                             polling client exchanges.
//
// `status` carries the terminal state explicitly:
//   pending  — newly issued, awaiting human action
//   approved — `userId` bound, polling client's next exchange consumes
//   denied   — human pressed "Deny" on the approval page; polling
//              client sees `access_denied` (RFC 8628 §3.5) and gives
//              up immediately rather than waiting out the TTL
//
// Privacy note: surfacing `denied` does leak "user is online and
// rejected this prompt" to the polling client. We accept that tradeoff
// for the UX win of fast feedback — operators concerned about the
// signal can simply not surface a Deny button (the approval row
// expires naturally).
//
// Compared to emdash's reference shape: their `device_code` PK is
// stored plaintext. We hash the device_code at rest (DB leak ≠ secret
// leak) and otherwise carry the same status enum.
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
    /** RFC 8628 §3.5 default 600s. Past this the polling client gets `expired_token`. */
    expiresAt: t.integer({ mode: "timestamp" }).notNull(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    // user_code has a unique constraint (its own lookup index).
    // expires_at: prune-expired sweep.
    // user_id: SQLite doesn't auto-index FK columns, so the
    //   `onDelete: "cascade"` cleanup would full-scan without this.
    //   Also enables future "list device-flow approvals by user"
    //   queries without a table scan.
    index("device_codes_expires_at_idx").on(table.expiresAt),
    index("device_codes_user_id_idx").on(table.userId),
  ],
);

export type DeviceCode = typeof deviceCodes.$inferSelect;
export type NewDeviceCode = typeof deviceCodes.$inferInsert;

export const deviceCodeInsertSchema = createInsertSchema(deviceCodes);
export const deviceCodeSelectSchema = createSelectSchema(deviceCodes);
