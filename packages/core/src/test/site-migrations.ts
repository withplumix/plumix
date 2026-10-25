import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

import type { AnyPluginDescriptor } from "../config.js";
import { CORE_MIGRATIONS } from "./harness.js";

/**
 * Core, each package a plugin's `schemaModule` names, then the site's own
 * `migrations/` for a relative one. Found by folder, so a test reads no
 * `dist/`.
 */
export function migrationFolders(
  siteRoot: string,
  plugins: readonly AnyPluginDescriptor[],
): readonly string[] {
  const packages: string[] = [];
  let siteOwnsTables = false;
  for (const plugin of plugins) {
    const spec = plugin.schemaModule;
    if (spec === undefined) continue;
    if (spec.startsWith(".")) {
      siteOwnsTables = true;
      continue;
    }
    const root = packageRoot(siteRoot, packageName(spec), plugin.id);
    if (!packages.includes(root)) packages.push(root);
  }
  const owners = siteOwnsTables ? [...packages, siteRoot] : packages;
  return [CORE_MIGRATIONS, ...owners.map(historyOf)];
}

/** `@scope/name/schema` → `@scope/name`; `name/schema` → `name`. */
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
