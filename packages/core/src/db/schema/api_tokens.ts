import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

// Personal access tokens. Stored as the SHA-256 hash of the raw token
// secret (the secret itself is shown to the user exactly once, never
// recoverable). Format on the wire: `pl_pat_<32-byte base64url>`.
//
// `prefix` keeps a short readable fragment of the secret (e.g.
// `pl_pat_abc1`) so the admin's token list can identify which row is
// which without ever storing the full secret. GitHub does this with
// `ghp_xxxxxxxxxxxxxxxx_xxxx`; we keep the displayed fragment short
// and human-friendly.
//
// `scopes` constrains what the token may do. Stored as a JSON array of
// capability strings (`"entry:post:read"`, `"settings:manage"`, …) or
// null. null = inherit unrestricted from the user's current role caps;
// non-null array = intersection of the array with role caps (so a token
// can never exceed the user's role even if it requests a cap the user
// no longer has). Empty array `[]` is legal and means "no caps" — a
// token kept around for revocation timing without granting access.
// `auth.can()` is the single chokepoint that consults this — every
// capability check in core + plugins goes through it.
export const apiTokens = sqliteTable(
  "api_tokens",
  (t) => ({
    /** SHA-256 hash of the raw token. Looked up on every authed request. */
    id: t.text().primaryKey(),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Human-readable label set by the user — "GitHub Actions deploy", "MCP server". */
    name: t.text().notNull(),
    /**
     * Short readable fragment of the secret (e.g. `pl_pat_abc1`). The
     * token list shows this so the user can identify the token without
     * the full secret being recoverable. Shown alongside `lastUsedAt`
     * so a user with three tokens can tell which is which.
     */
    prefix: t.text().notNull(),
    /**
     * Optional expiry. Null = never expires. Operators are nudged to
     * set one; the create form defaults to 90 days but allows "never"
     * for tokens used by long-lived infra (CI bots, MCP servers).
     */
    expiresAt: t.integer({ mode: "timestamp" }),
    /**
     * Capability scope whitelist. null = unrestricted (inherits the
     * user's current role caps). Non-null = intersection of this list
     * with the user's role caps — so the token can never escalate even
     * if it lists a cap the user no longer has. See header comment.
     */
    scopes: t.text({ mode: "json" }).$type<readonly string[]>(),
    /** Updated on every successful auth. Helps spot dead tokens for cleanup. */
    lastUsedAt: t.integer({ mode: "timestamp" }),
    /**
     * Soft-delete: revoke marks the row instead of removing it so a
     * future audit-log surface can attribute past actions to a now-
     * revoked token. The auth path treats `revokedAt != null` as
     * "token doesn't exist" — same shape as expired.
     */
    revokedAt: t.integer({ mode: "timestamp" }),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    index("api_tokens_user_id_idx").on(table.userId),
    index("api_tokens_revoked_at_idx").on(table.revokedAt),
  ],
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export const apiTokenInsertSchema = createInsertSchema(apiTokens);
export const apiTokenSelectSchema = createSelectSchema(apiTokens);
