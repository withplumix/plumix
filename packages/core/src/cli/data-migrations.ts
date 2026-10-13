import type { DataMigration } from "../db/data-migration.js";

/** Core's own data migrations, run before every plugin's and the site's. */
export const CORE_DATA_MIGRATIONS: readonly DataMigration[] = [];
