import { join } from "node:path";
import type { Plugin } from "vite";
import { createBuilder } from "vite";

import type { PlumixConfig } from "@plumix/core";

import type { DataMigrationModules } from "../cli/migrate/data-modules.js";
import type { ServerEnvironmentOptions } from "./server-environment.js";
import { resolveDataMigrationModules } from "../cli/migrate/data-modules.js";
import { serverEnvironment } from "./server-environment.js";
import { withoutUseClientWarning } from "./use-client-warning.js";

const ENTRY_ID = "virtual:plumix/data-migrations";
const RESOLVED_ENTRY_ID = `\0${ENTRY_ID}`;

function entrySource(modules: readonly DataMigrationModules[]): string {
  let next = 0;
  const imports: string[] = [];
  const owners = modules.map(({ owner, files }) => {
    const names = files.map((file) => {
      const name = `m${String(next++)}`;
      imports.push(`import ${name} from ${JSON.stringify(file)};`);
      return `...${name}`;
    });
    return `{ owner: ${JSON.stringify(owner)}, migrations: [${names.join(", ")}] }`;
  });
  return [...imports, `export default [${owners.join(", ")}];`, ""].join("\n");
}

/**
 * The plugin and site data migrations as their own bundle beside the server,
 * which imports it at start; empty when nothing declares any.
 */
export async function buildDataMigrations(
  site: { cwd: string; configPath: string; config: PlumixConfig },
  server: ServerEnvironmentOptions,
): Promise<void> {
  const source = entrySource(
    resolveDataMigrationModules(site.cwd, site.configPath, site.config),
  );
  const entry: Plugin = {
    name: "plumix:data-migrations",
    resolveId: (id) => (id === ENTRY_ID ? RESOLVED_ENTRY_ID : undefined),
    load: (id) => (id === RESOLVED_ENTRY_ID ? source : undefined),
  };
  const environment = serverEnvironment(server);
  const builder = await createBuilder({
    configFile: false,
    root: site.cwd,
    logLevel: "warn",
    plugins: [entry],
    environments: {
      server: {
        ...environment,
        build: {
          ...environment.build,
          outDir: join(server.outDir, "migrations"),
          // The owners' histories are already there.
          emptyOutDir: false,
          rolldownOptions: {
            // A migration importing `plumix/db` reaches core's blocks.
            onLog: withoutUseClientWarning(undefined),
            input: ENTRY_ID,
            output: { entryFileNames: "data-migrations.js" },
          },
        },
      },
    },
  });
  // Every builder has a client environment too; only this one is built.
  for (const [name, built] of Object.entries(builder.environments)) {
    if (name === "server") await builder.build(built);
  }
}
