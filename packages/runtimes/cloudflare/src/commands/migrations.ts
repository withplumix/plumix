import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  MigrationDatabase,
  MigrationDatabaseTarget,
  MigrationLocation,
  RuntimeMigrations,
} from "plumix/cli";
import type { GetPlatformProxyOptions, PlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { migrate } from "drizzle-orm/d1/migrator";

import type {
  D1BindingEntry,
  LoadedWranglerConfig,
} from "../wrangler-config.js";
import type { D1Block, DeployTarget } from "./d1-target.js";
import { isD1 } from "../d1.js";
import { loadWranglerConfig } from "../wrangler-config.js";
import {
  D1_TARGET_OPTIONS,
  deployTargetOf,
  resolveD1Block,
} from "./d1-target.js";
import { CloudflareCliError } from "./errors.js";

/**
 * Where `plumix dev` (`@cloudflare/vite-plugin`) and the playground's built
 * server keep local state, under the project root.
 */
const LOCAL_STATE = ".wrangler/state/v3";

/** The site's local D1, which `plumix dev` opens: the top level's. */
function localBlock(config: LoadedWranglerConfig): D1Block {
  return {
    path: "the top level",
    summary: "local",
    sharedPreviews: false,
    d1Databases: config.d1Databases,
    ...(config.compatibilityDate === undefined
      ? {}
      : { compatibilityDate: config.compatibilityDate }),
    ...(config.accountId === undefined ? {} : { accountId: config.accountId }),
  };
}

interface ChosenD1 {
  readonly block: D1Block;
  readonly entry: D1BindingEntry & { binding: string };
}

function chooseBinding(
  filename: string,
  block: D1Block,
  binding: string | undefined,
): ChosenD1 {
  const entries = block.d1Databases.filter(
    (entry): entry is D1BindingEntry & { binding: string } =>
      typeof entry.binding === "string" && entry.binding !== "",
  );
  const bindings = entries.map((entry) => entry.binding);
  const [first, ...more] = entries;
  if (first === undefined) {
    throw CloudflareCliError.migrateNoD1({
      filename,
      block: block.path,
      binding: binding ?? "<binding>",
    });
  }
  if (binding !== undefined) {
    const entry = entries.find((candidate) => candidate.binding === binding);
    if (entry === undefined) {
      throw CloudflareCliError.migrateUnknownBinding({
        filename,
        binding,
        bindings,
      });
    }
    return { block, entry };
  }
  if (more.length > 0) {
    throw CloudflareCliError.migrateAmbiguousBinding({ filename, bindings });
  }
  return { block, entry: first };
}

/** Only what names the database: a `preview_database_id` would redirect it. */
function remoteEntry(entry: ChosenD1["entry"]): object {
  const { binding, database_name, database_id } = entry;
  return {
    binding,
    ...(database_name === undefined ? {} : { database_name }),
    ...(database_id === undefined ? {} : { database_id }),
    remote: true,
  };
}

/**
 * Only the binding to migrate, so the proxy starts nothing else; `remote` is
 * how wrangler reaches the deployed database.
 */
function proxyOptions(
  cwd: string,
  configDir: string,
  { block, entry }: ChosenD1,
  location: Reach,
): GetPlatformProxyOptions {
  const configPath = join(configDir, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "plumix-migrate",
      ...(block.compatibilityDate === undefined
        ? {}
        : { compatibility_date: block.compatibilityDate }),
      ...(block.accountId === undefined ? {} : { account_id: block.accountId }),
      d1_databases: [location === "remote" ? remoteEntry(entry) : entry],
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

function targetOf(
  { block, entry }: ChosenD1,
  location: Reach,
): MigrationDatabaseTarget {
  if (location === "memory") {
    return { remote: false, summary: "memory", notes: [], name: "memory" };
  }
  const name = entry.database_name ?? entry.database_id ?? "";
  return {
    remote: location === "remote",
    summary: `${block.summary} · ${entry.binding} · ${name}`,
    notes: block.sharedPreviews ? [SHARED_PREVIEWS_NOTE] : [],
    name,
  };
}

const SHARED_PREVIEWS_NOTE =
  "Every Worker Preview without a previews block of its own uses this database too.";

/**
 * Triggers first, so no drop fires one; a virtual table before its shadow
 * tables. D1's own `_cf_` tables refuse a drop.
 */
const WIPED_SQL =
  "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'trigger') AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type = 'table', sql NOT LIKE 'CREATE VIRTUAL TABLE%'";

/** wrangler finds a database it is not bound to by name, through the API. */
async function restorePoint(cwd: string, database: string): Promise<string> {
  const bookmark = await migrationsDeps.timeTravelBookmark(cwd, database);
  return `Restore point: D1 Time Travel bookmark ${bookmark}. To undo the wipe, run \`wrangler d1 time-travel restore ${database} --bookmark=${bookmark}\`.`;
}

function migrationDatabase(
  d1: D1Database,
  target: MigrationDatabaseTarget,
  restore: (() => Promise<string>) | undefined,
  dispose: () => Promise<void>,
): MigrationDatabase {
  // A query builder over a column needs the request database's snake_case.
  const db = drizzle(d1, { casing: "snake_case" });
  return {
    drizzle: db,
    migrate: (folder) => migrate(db, folder),
    async all(sql) {
      const { results } = await d1.prepare(sql).all();
      return results;
    },
    async batch(statements) {
      await d1.batch(
        statements.map(({ sql, params }) => d1.prepare(sql).bind(...params)),
      );
    },
    async wipe() {
      const { results } = await d1
        .prepare(WIPED_SQL)
        .all<{ type: "table" | "trigger"; name: string }>();
      if (results.length === 0) return;
      // D1 ignores `PRAGMA foreign_keys`; the deferral lasts to the commit.
      await d1.batch([
        d1.prepare("PRAGMA defer_foreign_keys = ON"),
        ...results.map(({ type, name }) =>
          d1.prepare(
            `DROP ${type.toUpperCase()} IF EXISTS "${name.replaceAll('"', '""')}"`,
          ),
        ),
      ]);
    },
    ...(restore === undefined ? {} : { restorePoint: restore }),
    close: dispose,
    target,
  };
}

type Reach = "local" | "remote" | "memory";

function reachOf(
  location: MigrationLocation,
  target: DeployTarget | null,
): Reach {
  if (location === "memory") return "memory";
  return target === null ? "local" : "remote";
}

async function chooseD1(
  cwd: string,
  binding: string | undefined,
  target: DeployTarget | null,
): Promise<ChosenD1> {
  const config = migrationsDeps.loadWranglerConfig(cwd);
  if (config === null)
    throw CloudflareCliError.migrateNoWranglerConfig({ cwd });
  const block =
    target === null
      ? localBlock(config)
      : await resolveD1Block(join(cwd, config.filename), config, target);
  return chooseBinding(config.filename, block, binding);
}

/**
 * `plumix migrate` opens the site's D1 binding through wrangler's
 * `getPlatformProxy`: the local database `plumix dev` uses, or the deployed
 * one the target options name. Without `--binding`, the one `d1()` names.
 */
export const migrations: RuntimeMigrations = {
  targetOptions: D1_TARGET_OPTIONS,
  legacyTable: "d1_migrations",
  async open({ cwd, config, location, binding, targetValues }) {
    const deployTarget = deployTargetOf(
      targetValues,
      process.env.CLOUDFLARE_ENV,
    );
    const chosen = await chooseD1(
      cwd,
      binding ??
        (isD1(config.database) ? config.database.config.binding : undefined),
      deployTarget,
    );
    const reach = reachOf(location, deployTarget);
    const configDir = mkdtempSync(join(tmpdir(), "plumix-migrate-"));
    let proxy: PlatformProxy;
    try {
      proxy = await migrationsDeps.getPlatformProxy(
        proxyOptions(cwd, configDir, chosen, reach),
      );
    } catch (error) {
      rmSync(configDir, { recursive: true, force: true });
      throw error;
    }
    const d1 = proxy.env[chosen.entry.binding] as D1Database;
    const target = targetOf(chosen, reach);
    const restore =
      reach === "remote" ? () => restorePoint(cwd, target.name) : undefined;
    return migrationDatabase(d1, target, restore, async () => {
      await proxy.dispose();
      rmSync(configDir, { recursive: true, force: true });
    });
  },
};

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 * wrangler loads on first use: an optional peer, and a heavy one.
 */
export const migrationsDeps = {
  loadWranglerConfig,
  /** The bookmark that names the database as it is now. */
  timeTravelBookmark: async (
    cwd: string,
    database: string,
  ): Promise<string> => {
    const { stdout } = await promisify(execFile)(
      "wrangler",
      ["d1", "time-travel", "info", database, "--json"],
      { cwd },
    );
    return (JSON.parse(stdout) as { bookmark: string }).bookmark;
  },
  getPlatformProxy: async (
    options: GetPlatformProxyOptions,
  ): Promise<PlatformProxy> =>
    (await import("wrangler")).getPlatformProxy(options),
};
