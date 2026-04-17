import { sql } from "drizzle-orm";
import { index, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";

import { users } from "./users.js";

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  (t) => ({
    provider: t.text().notNull(),
    providerAccountId: t.text().notNull(),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: t
      .integer({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  }),
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("oauth_accounts_user_id_idx").on(table.userId),
  ],
);

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;

export const oauthAccountInsertSchema = createInsertSchema(oauthAccounts);
export const oauthAccountSelectSchema = createSelectSchema(oauthAccounts);
