import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

import { users } from "./users.js";

/**
 * RFC 6749 §4.1.2 codes, deleted by their first exchange. `id` is
 * SHA-256(code), so a DB leak isn't a secret leak.
 */
export const oauthAuthorizationCodes = sqliteTable(
  "oauth_authorization_codes",
  (t) => ({
    id: t.text().primaryKey(),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The exchange must name the same client, redirect URI and resource. */
    clientId: t.text().notNull(),
    redirectUri: t.text().notNull(),
    resource: t.text().notNull(),
    /** The S256 PKCE challenge the exchange's verifier must hash to. */
    codeChallenge: t.text().notNull(),
    /** The approved capability list the access token carries. */
    scopes: t.text({ mode: "json" }).notNull().$type<readonly string[]>(),
    expiresAt: t.integer({ mode: "timestamp" }).notNull(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    // SQLite doesn't index FK columns, so the user cascade would full-scan.
    index("oauth_authorization_codes_user_id_idx").on(table.userId),
  ],
);
