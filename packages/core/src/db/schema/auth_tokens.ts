import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { USER_ROLES, users } from "./users.js";

export const AUTH_TOKEN_TYPES = [
  "webauthn_challenge",
  "magic_link",
  "email_verification",
  "password_reset",
  "invite",
  "oauth_state",
] as const;

export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[number];

export const authTokens = sqliteTable(
  "auth_tokens",
  (t) => ({
    hash: t.text().primaryKey(),
    userId: t.integer().references(() => users.id, { onDelete: "cascade" }),
    email: t.text(),
    type: t.text({ enum: AUTH_TOKEN_TYPES }).notNull(),
    role: t.text({ enum: USER_ROLES }),
    invitedBy: t.integer().references(() => users.id, { onDelete: "set null" }),
    // Free-form per-type payload. Today only `oauth_state` populates this
    // (PKCE verifier + provider key + return path); kept nullable so the
    // existing token types keep their narrow column footprint.
    payload: t.text({ mode: "json" }).$type<Record<string, unknown>>(),
    expiresAt: t.integer({ mode: "timestamp" }).notNull(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    index("auth_tokens_user_id_idx").on(table.userId),
    index("auth_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;

export const authTokenInsertSchema = createInsertSchema(authTokens);
export const authTokenSelectSchema = createSelectSchema(authTokens);
