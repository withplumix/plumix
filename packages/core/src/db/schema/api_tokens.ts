import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

// Stores only the SHA-256 hash; the secret is shown once and never recoverable.
export const apiTokens = sqliteTable(
  "api_tokens",
  (t) => ({
    /** SHA-256 hash of the raw token. Looked up on every authed request. */
    id: t.text().primaryKey(),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Human-readable label set by the user — "GitHub Actions deploy", "MCP
     * server".
     */
    name: t.text().notNull(),
    /**
     * Lets the token list identify a token without the secret being
     * recoverable.
     */
    prefix: t.text().notNull(),
    /**
     * Optional expiry. Null = never expires. Operators are nudged to
     * set one; the create form defaults to 90 days but allows "never"
     * for tokens used by long-lived infra (CI bots, MCP servers).
     */
    expiresAt: t.integer({ mode: "timestamp" }),
    /**
     * null inherits the user's role caps; a list intersects with them, so a
     * token never exceeds its user. `[]` grants nothing.
     */
    scopes: t.text({ mode: "json" }).$type<readonly string[]>(),
    /** Updated on every successful auth. Helps spot dead tokens for cleanup. */
    lastUsedAt: t.integer({ mode: "timestamp" }),
    /**
     * Revoked rows stay so past actions remain attributable; auth treats
     * `revokedAt != null` like an expired token.
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
