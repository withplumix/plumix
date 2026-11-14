import { sqliteTable } from "drizzle-orm/sqlite-core";
import { entries } from "plumix/schema";

/**
 * The entries whose `seo_noindex` meta is `true`, kept beside `entries` so a
 * sitemap excludes them by key instead of parsing every row's meta.
 */
export const seoNoindexedEntries = sqliteTable(
  "seo_noindexed_entries",
  (t) => ({
    entryId: t
      .integer()
      .primaryKey()
      .references(() => entries.id, { onDelete: "cascade" }),
    type: t.text().notNull(),
  }),
);
