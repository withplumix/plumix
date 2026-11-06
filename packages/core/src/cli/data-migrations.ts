import { sql } from "drizzle-orm";

import type { DataMigration } from "../db/data-migration.js";

/**
 * Raw SQL: the runner's drizzle has no schema or casing, and a rename is no
 * edit to stamp. `plumix migrate` guards the `contributor` rows it leaves.
 */
const renameSubscriberToMember: DataMigration = {
  name: "rename-subscriber-to-member",
  async up({ db }) {
    await db.run(
      sql`UPDATE users SET role = 'member' WHERE role = 'subscriber'`,
    );
    await db.run(
      sql`UPDATE auth_tokens SET role = 'member' WHERE role = 'subscriber'`,
    );
  },
};

/** Core's own data migrations, run before every plugin's and the site's. */
export const CORE_DATA_MIGRATIONS: readonly DataMigration[] = [
  renameSubscriberToMember,
];
