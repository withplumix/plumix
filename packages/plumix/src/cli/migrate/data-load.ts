import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";

import type { PlumixConfig } from "@plumix/core";
import type { DataMigration } from "@plumix/core/db";

import type { DataMigrationOwner } from "./data.js";
import { plumixPathAliases } from "../../vite/path-aliases.js";
import { resolveDataMigrationModules } from "./data-modules.js";

/**
 * The plugin and site data migrations, imported in the CLI's own process.
 * Never imported by a built server, which reads them from its own bundle.
 */
export async function loadDataMigrations(
  cwd: string,
  configPath: string,
  config: PlumixConfig,
): Promise<readonly DataMigrationOwner[]> {
  const modules = resolveDataMigrationModules(cwd, configPath, config);
  if (modules.length === 0) return [];
  const jiti = createJiti(pathToFileURL(configPath).href, {
    interopDefault: true,
    // Each run reads the modules as they are now.
    moduleCache: false,
    // The same `~/` and `@/` imports the config's graph resolves.
    alias: Object.fromEntries(
      plumixPathAliases(cwd).map((a) => [a.find, a.replacement]),
    ),
  });
  const owners: DataMigrationOwner[] = [];
  for (const { owner, files } of modules) {
    const migrations: DataMigration[] = [];
    for (const file of files) {
      migrations.push(
        ...(await jiti.import<readonly DataMigration[]>(file, {
          default: true,
        })),
      );
    }
    owners.push({ owner, migrations });
  }
  return owners;
}
