import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { AnyPluginDescriptor } from "../config.js";
import { resolveSiteModule } from "../cli/site-module.js";
import { CORE_MIGRATIONS } from "./harness.js";

/**
 * Core, each package a plugin's `schemaModule` lands in, then the site's own
 * `migrations/`. Found by folder, so a test reads no `dist/`.
 */
export function migrationFolders(
  configDir: string,
  plugins: readonly AnyPluginDescriptor[],
): readonly string[] {
  const siteRoot = packageRootOf(configDir);
  const packages: string[] = [];
  let siteOwnsTables = false;
  for (const plugin of plugins) {
    const spec = plugin.schemaModule;
    if (spec === undefined) continue;
    const root = spec.startsWith(".")
      ? packageRootOf(dirname(siteModule(configDir, spec, plugin.id)))
      : packageRoot(siteRoot, packageName(spec), plugin.id);
    if (root === siteRoot) siteOwnsTables = true;
    else if (!packages.includes(root)) packages.push(root);
  }
  const owners = siteOwnsTables ? [...packages, siteRoot] : packages;
  return [CORE_MIGRATIONS, ...owners.map(historyOf)];
}

/** The nearest folder up from `dir` with a `package.json`, or `dir` itself. */
function packageRootOf(dir: string): string {
  for (let current = dir; ; current = dirname(current)) {
    if (existsSync(join(current, "package.json"))) return current;
    if (dirname(current) === current) return dir;
  }
}

function siteModule(configDir: string, spec: string, pluginId: string): string {
  const file = resolveSiteModule(configDir, spec);
  if (file !== undefined) return file;
  throw new Error(
    `testSite: plugin "${pluginId}" names its schema in "${spec}", but ${resolve(configDir, spec)} does not exist. Relative paths resolve from the folder holding plumix.config.ts.`,
  );
}

function packageName(spec: string): string {
  const parts = spec.split("/");
  return (spec.startsWith("@") ? parts.slice(0, 2) : parts.slice(0, 1)).join(
    "/",
  );
}

/** The site itself, or the package as Node finds it from the site. */
function packageRoot(siteRoot: string, name: string, pluginId: string): string {
  if (nameOf(siteRoot) === name) return siteRoot;
  for (let dir = siteRoot; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    if (dirname(dir) === dir) {
      throw new Error(
        `testSite: plugin "${pluginId}" names its schema in "${name}", which is not installed in ${siteRoot}.`,
      );
    }
  }
}

function nameOf(root: string): string | undefined {
  const manifest = join(root, "package.json");
  if (!existsSync(manifest)) return undefined;
  return (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name;
}

function historyOf(root: string): string {
  const folder = join(root, "migrations");
  if (existsSync(folder)) return folder;
  throw new Error(
    `testSite: ${root} declares a schema but ships no migrations/ folder.`,
  );
}
