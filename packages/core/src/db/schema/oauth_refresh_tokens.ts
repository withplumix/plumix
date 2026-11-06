import { sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

import { oauthGrants } from "./oauth_grants.js";

/**
 * Refresh tokens, rotated on every use. `id` is SHA-256(token), so a DB leak
 * isn't a secret leak. A rotated row stays, so presenting it again is caught
 * as reuse.
 */
export const oauthRefreshTokens = sqliteTable(
  "oauth_refresh_tokens",
  (t) => ({
    id: t.text().primaryKey(),
    grantId: t
      .integer()
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    /** The access token it mints is bound to this resource. */
    resource: t.text().notNull(),
    /** The approved capability list the access token carries. */
    scopes: t.text({ mode: "json" }).notNull().$type<readonly string[]>(),
    expiresAt: t.integer({ mode: "timestamp" }).notNull(),
    rotatedAt: t.integer({ mode: "timestamp" }),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    // SQLite doesn't index FK columns, so the grant cascade would full-scan.
    index("oauth_refresh_tokens_grant_id_idx").on(table.grantId),
  ],
);
