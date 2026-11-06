import { sql } from "drizzle-orm";
import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./users.js";

/**
 * A person's approval of one OAuth client. One row per person and client: a
 * later approval replaces the capabilities of the one before.
 */
export const oauthGrants = sqliteTable(
  "oauth_grants",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The client's metadata document URL. */
    clientId: t.text().notNull(),
    /**
     * Resolved at consent from the scope and the person's role, so a
     * capability the role gains later never widens the grant.
     */
    scopes: t.text({ mode: "json" }).notNull().$type<readonly string[]>(),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    // Leads with `user_id`, so the user cascade uses it too.
    uniqueIndex("oauth_grants_user_id_client_id_idx").on(
      table.userId,
      table.clientId,
    ),
  ],
);

export type OAuthGrant = typeof oauthGrants.$inferSelect;
