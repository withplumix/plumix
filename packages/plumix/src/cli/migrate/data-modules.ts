import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { PlumixConfig } from "@plumix/core";

import { PlumixCliError } from "../errors.js";
import {
  isSitePackage,
  nearestPackageRoot,
  readPackageName,
  resolveModuleSpec,
  siteRootOf,
} from "./owners.js";

/** One owner's data-migration modules, each a file, in run order. */
export interface DataMigrationModules {
  /** `site`, or the package name, as schema owners are named. */
  readonly owner: string;
  readonly files: readonly string[];
}

function resolvePluginModule(
  cwd: string,
  configPath: string,
  spec: string,
): string {
  const resolved = resolveModuleSpec(cwd, configPath, spec);
  if ("file" in resolved) return resolved.file;
  throw PlumixCliError.migrateDataModuleUnresolved({
    spec,
    cause: resolved.cause,
  });
}

function resolveConfigModule(configPath: string, spec: string): string {
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
    const file = resolvePluginModule(cwd, configPath, plugin.dataMigrations);
    const root = nearestPackageRoot(file);
    if (root === null || isSitePackage(root, siteRoot)) {
      add(site, file);
      continue;
    }
    const owner = readPackageName(root);
    const files = packages.get(owner) ?? [];
    packages.set(owner, files);
    add(files, file);
  }
  if (config.dataMigrations) {
    add(site, resolveConfigModule(configPath, config.dataMigrations));
  }
  return [
    ...[...packages].map(([owner, files]) => ({ owner, files })),
    ...(site.length > 0 ? [{ owner: "site", files: site }] : []),
  ];
}
