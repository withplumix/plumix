import { defineDataMigration, sql } from "plumix/db";

import { SEO_META_KEYS } from "../meta-keys.js";

/**
 * Raw SQL: the runner's drizzle has no casing for a table object's columns.
 * Only a stored `true` counts, and `or ignore` makes a rerun safe.
 */
const seedNoindexedEntries = defineDataMigration({
  name: "seed-noindexed-entries",
  async up({ db }) {
    await db.run(
      sql`insert or ignore into seo_noindexed_entries (entry_id, type) select id, type from entries where json_type(meta, ${`$.${SEO_META_KEYS.noindex}`}) = 'true'`,
    );
  },
});

/** seo's data migrations, in the order they run. */
export default [seedNoindexedEntries] as const;
