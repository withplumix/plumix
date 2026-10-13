import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import type { PlumixConfig } from "@plumix/core";

import { PlumixCliError } from "../errors.js";
import {
  nearestPackageRoot,
  readPackageName,
  SITE_SCHEMA_OUT,
  siteRootOf,
} from "./owners.js";

/** One owner's data-migration modules, each a file, in run order. */
export interface DataMigrationModules {
  /** `site`, or the package name, as schema owners are named. */
  readonly owner: string;
  readonly files: readonly string[];
}

/** A plugin's spec resolves from where the site imports its `schemaModule`s. */
function resolvePluginModule(cwd: string, spec: string): string {
  try {
    return createRequire(join(cwd, SITE_SCHEMA_OUT)).resolve(spec);
  } catch (cause) {
    throw PlumixCliError.migrateDataModuleUnresolved({ spec, cause });
  }
}

function resolveSiteModule(configPath: string, spec: string): string {
  const file = resolve(dirname(configPath), spec);
  if (!existsSync(file)) {
    throw PlumixCliError.migrateDataModuleUnresolved({
      spec,
      cause: `${file} does not exist`,
    });
  }
  return file;
}

/**
 * Resolved, not imported. Plugin packages in config order, then the site: a
 * plugin module inside its package, then the config's own. A module named
 * twice runs once.
 */
export function resolveDataMigrationModules(
  cwd: string,
  configPath: string,
  config: PlumixConfig,
): readonly DataMigrationModules[] {
  const siteRoot = siteRootOf(configPath);
  const packages = new Map<string, string[]>();
  const site: string[] = [];
  const seen = new Set<string>();
  const add = (files: string[], file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    files.push(file);
  };
  for (const plugin of config.plugins) {
    if (!plugin.dataMigrations) continue;
    const file = resolvePluginModule(cwd, plugin.dataMigrations);
    const root = nearestPackageRoot(file);
    if (root === null || root === siteRoot) {
      add(site, file);
      continue;
    }
    const owner = readPackageName(root);
    const files = packages.get(owner) ?? [];
    packages.set(owner, files);
    add(files, file);
  }
  if (config.dataMigrations) {
    add(site, resolveSiteModule(configPath, config.dataMigrations));
  }
  return [
    ...[...packages].map(([owner, files]) => ({ owner, files })),
    ...(site.length > 0 ? [{ owner: "site", files: site }] : []),
  ];
}
