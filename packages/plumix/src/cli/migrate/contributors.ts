import type {
  MigrationDatabase,
  PluginRegistry,
  PlumixConfig,
} from "@plumix/core";
import { contributorRoleSnippet } from "@plumix/core/cli";

import { PlumixCliError } from "../errors.js";

async function contributorCount(db: MigrationDatabase): Promise<number> {
  const table = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
  );
  if (table.length === 0) return 0;
  const [row] = await db.all(
    "SELECT count(*) AS n FROM users WHERE role = 'contributor'",
  );
  return Number(row?.n ?? 0);
}

/**
 * `contributor` is no longer a default role, so its users keep their rights
 * only through one the config declares. Run before anything is written.
 */
export async function assertContributorRoleDeclared(
  db: MigrationDatabase,
  config: PlumixConfig,
  plugins: () => Promise<PluginRegistry>,
): Promise<void> {
  if (config.roles?.contributor !== undefined) return;
  const count = await contributorCount(db);
  if (count === 0) return;
  throw PlumixCliError.migrateContributorRoleMissing({
    count,
    snippet: contributorRoleSnippet(await plugins()),
  });
}
