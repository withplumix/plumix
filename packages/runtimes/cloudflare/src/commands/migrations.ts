import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  MigrationDatabase,
  MigrationLocation,
  RuntimeMigrations,
} from "plumix";
import type { GetPlatformProxyOptions, PlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { migrate } from "drizzle-orm/d1/migrator";

import type { D1BindingEntry } from "../wrangler-config.js";
import { loadWranglerConfig } from "../wrangler-config.js";
import { CloudflareCliError } from "./errors.js";

// Where `plumix dev` (`@cloudflare/vite-plugin`) and the playground's built
// server keep local state, under the project root.
const LOCAL_STATE = ".wrangler/state/v3";

function chooseBinding(
  cwd: string,
  binding: string | undefined,
): {
  config: NonNullable<ReturnType<typeof loadWranglerConfig>>;
  entry: D1BindingEntry & { binding: string };
} {
  const config = migrationsDeps.loadWranglerConfig(cwd);
  if (config === null)
    throw CloudflareCliError.migrateNoWranglerConfig({ cwd });
  const entries = config.d1Databases.filter(
    (entry): entry is D1BindingEntry & { binding: string } =>
      typeof entry.binding === "string" && entry.binding !== "",
  );
  const bindings = entries.map((entry) => entry.binding);
  if (binding !== undefined) {
    const entry = entries.find((candidate) => candidate.binding === binding);
    if (entry === undefined) {
      throw CloudflareCliError.migrateUnknownBinding({
        filename: config.filename,
        binding,
        bindings,
      });
    }
    return { config, entry };
  }
  const [entry, ...more] = entries;
  if (entry === undefined) {
    throw CloudflareCliError.migrateNoD1({ filename: config.filename });
  }
  if (more.length > 0) {
    throw CloudflareCliError.migrateAmbiguousBinding({
      filename: config.filename,
      bindings,
    });
  }
  return { config, entry };
}

// A config holding only the binding to migrate, so the proxy starts nothing
// else the site declares; marked `remote` for `--remote`, which is how
// wrangler's remote bindings reach the deployed database.
function proxyOptions(
  cwd: string,
  configDir: string,
  { config, entry }: ReturnType<typeof chooseBinding>,
  location: MigrationLocation,
): GetPlatformProxyOptions {
  const configPath = join(configDir, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "plumix-migrate",
      ...(config.compatibilityDate === undefined
        ? {}
        : { compatibility_date: config.compatibilityDate }),
      ...(config.accountId === undefined
        ? {}
        : { account_id: config.accountId }),
      d1_databases: [
        location === "remote" ? { ...entry, remote: true } : entry,
      ],
    }),
  );
  return {
    configPath,
    // Local D1 state is keyed by the database id alone, so this file is the
    // one `plumix dev` opens.
    persist: location === "local" ? { path: join(cwd, LOCAL_STATE) } : false,
    remoteBindings: location === "remote",
  };
}

function migrationDatabase(
  d1: D1Database,
  dispose: () => Promise<void>,
): MigrationDatabase {
  return {
    migrate: (folder) => migrate(drizzle(d1), folder),
    async all(sql) {
      const { results } = await d1.prepare(sql).all();
      return results;
    },
    async batch(statements) {
      await d1.batch(
        statements.map(({ sql, params }) => d1.prepare(sql).bind(...params)),
      );
    },
    close: dispose,
  };
}

/**
 * `plumix migrate` opens the site's D1 binding through wrangler's
 * `getPlatformProxy`: the local database `plumix dev` uses, or with
 * `--remote` the deployed one.
 */
export const migrations: RuntimeMigrations = {
  remote: true,
  legacyTable: "d1_migrations",
  async open({ cwd, location, binding }) {
    const chosen = chooseBinding(cwd, binding);
    const configDir = mkdtempSync(join(tmpdir(), "plumix-migrate-"));
    let proxy: PlatformProxy;
    try {
      proxy = await migrationsDeps.getPlatformProxy(
        proxyOptions(cwd, configDir, chosen, location),
      );
    } catch (error) {
      rmSync(configDir, { recursive: true, force: true });
      throw error;
    }
    const d1 = proxy.env[chosen.entry.binding] as D1Database;
    return migrationDatabase(d1, async () => {
      await proxy.dispose();
      rmSync(configDir, { recursive: true, force: true });
    });
  },
};

// Mutable seam for tests — substitute the collaborator, not the module path.
// wrangler loads on first use: an optional peer, and a heavy one.
export const migrationsDeps = {
  loadWranglerConfig,
  getPlatformProxy: async (
    options: GetPlatformProxyOptions,
  ): Promise<PlatformProxy> =>
    (await import("wrangler")).getPlatformProxy(options),
};
