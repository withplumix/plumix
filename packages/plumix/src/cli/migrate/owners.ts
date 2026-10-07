import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import type { MigrationFolder, PlumixConfig } from "@plumix/core";
import { CORE_MIGRATIONS_FOLDER } from "@plumix/core/cli";

import { PlumixCliError } from "../errors.js";

/** A table owner whose history applies to this site (ADR 0027). */
export interface MigrationOwner extends MigrationFolder {
  /** `core`, `site`, or the package name. */
  readonly name: string;
}

const TRACKING_TABLE_PREFIX = "__drizzle_migrations_";

// Where `plumix migrate generate` writes the module that re-exports the
// site's `schemaModule`s, so a spec resolves from here the way it imports them.
export const SITE_SCHEMA_OUT = ".plumix/site-schema.ts";

/** `@plumix/plugin-comments` → `plumix_plugin_comments`. */
function trackingSuffix(packageName: string): string {
  return packageName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function nearestPackageRoot(file: string): string | null {
  let current = dirname(file);
  for (;;) {
    if (existsSync(join(current, "package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveSchemaModule(cwd: string, spec: string): string {
  const base = join(cwd, SITE_SCHEMA_OUT);
  // A relative spec need not exist with its extension to name the folder it
  // sits in; a bare one is the package its resolution lands in.
  if (spec.startsWith(".")) return resolve(dirname(base), spec);
  try {
    return createRequire(base).resolve(spec);
  } catch (cause) {
    throw PlumixCliError.migrateSchemaModuleUnresolved({ spec, cause });
  }
}

function readPackageName(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name?: string;
  };
  return pkg.name ?? root;
}

// The site is the package its config lives in, wherever `--config` points.
export function siteRootOf(configPath: string): string {
  return nearestPackageRoot(configPath) ?? dirname(configPath);
}

/** The package a plugin's `schemaModule` resolves into, or `null` for the site. */
function schemaOwnerRoot(
  cwd: string,
  siteRoot: string,
  schemaModule: string,
): string | null {
  const root = nearestPackageRoot(resolveSchemaModule(cwd, schemaModule));
  return root === null || root === siteRoot ? null : root;
}

/**
 * The plugins that declare the site's own tables: those whose `schemaModule`
 * resolves inside the site's package rather than an installed one.
 */
export function sitePlugins(
  cwd: string,
  configPath: string,
  config: PlumixConfig,
): PlumixConfig["plugins"] {
  const siteRoot = siteRootOf(configPath);
  return config.plugins.filter(
    (plugin) =>
      plugin.schemaModule &&
      schemaOwnerRoot(cwd, siteRoot, plugin.schemaModule) === null,
  );
}

/**
 * Every owner whose history applies, in the order it applies: core, then each
 * package a plugin's `schemaModule` resolves into, in config order and each
 * once, then the site's own `migrations/` when it has one.
 */
export function resolveOwners(
  cwd: string,
  configPath: string,
  config: PlumixConfig,
): readonly MigrationOwner[] {
  const siteRoot = siteRootOf(configPath);
  const owners: MigrationOwner[] = [
    {
      name: "core",
      migrationsFolder: CORE_MIGRATIONS_FOLDER,
      migrationsTable: `${TRACKING_TABLE_PREFIX}core`,
    },
  ];
  const seen = new Set<string>();
  let siteOwnsTables = false;
  for (const plugin of config.plugins) {
    if (!plugin.schemaModule) continue;
    const root = schemaOwnerRoot(cwd, siteRoot, plugin.schemaModule);
    if (root === null) {
      siteOwnsTables = true;
      continue;
    }
    if (seen.has(root)) continue;
    seen.add(root);
    const name = readPackageName(root);
    const migrationsFolder = join(root, "migrations");
    if (!existsSync(migrationsFolder)) {
      throw PlumixCliError.migrateOwnerHistoryMissing({ packageName: name });
    }
    owners.push({
      name,
      migrationsFolder,
      migrationsTable: `${TRACKING_TABLE_PREFIX}${trackingSuffix(name)}`,
    });
  }
  const siteMigrations = join(siteRoot, "migrations");
  if (siteOwnsTables && existsSync(siteMigrations)) {
    owners.push({
      name: "site",
      migrationsFolder: siteMigrations,
      migrationsTable: `${TRACKING_TABLE_PREFIX}site`,
    });
  }
  return owners;
}
