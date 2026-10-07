import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import type { PlumixConfig } from "@plumix/core";
import { CORE_MIGRATIONS_FOLDER } from "@plumix/core/cli";

import { PlumixCliError } from "../errors.js";

/** A table owner whose history applies to this site (ADR 0027). */
export interface MigrationOwner {
  /** `core`, `site`, or the package name. */
  readonly name: string;
  readonly migrationsFolder: string;
  readonly migrationsTable: string;
}

const TRACKING_TABLE_PREFIX = "__drizzle_migrations_";

// Where `plumix migrate generate` writes the module that re-exports every
// `schemaModule`, so a spec resolves from here the way that module imports it.
const SCHEMA_MODULE_BASE = ".plumix/schema.ts";

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
  const base = join(cwd, SCHEMA_MODULE_BASE);
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
  // The site is the package its config lives in, wherever `--config` points.
  const siteRoot = nearestPackageRoot(configPath) ?? dirname(configPath);
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
    const root = nearestPackageRoot(
      resolveSchemaModule(cwd, plugin.schemaModule),
    );
    if (root === null || root === siteRoot) {
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
