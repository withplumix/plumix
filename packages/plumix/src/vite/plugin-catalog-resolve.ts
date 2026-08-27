import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

/**
 * Find the absolute path of a plugin's installed package root, used by
 * the bundler to resolve `i18n.catalogPath` against the plugin's own
 * directory (not the consumer's `projectRoot`).
 *
 * Tries known npm-name conventions in order — `@plumix/plugin-<id>`
 * for first-party plugins, `plumix-plugin-<id>` for community plugins.
 * Returns `null` if no convention resolves. `requireFrom` is a test
 * seam; production passes `createRequire` from `node:module`.
 */
export function findPluginPackageRoot(input: {
  readonly pluginId: string;
  readonly projectRoot: string;
  readonly requireFrom?: (filename: string) => {
    readonly resolve: (id: string) => string;
  };
}): string | null {
  const { pluginId, projectRoot } = input;
  const requireFrom = input.requireFrom ?? createRequire;
  const require = requireFrom(resolve(projectRoot, "package.json"));
  // First-party scope first; community plugins follow the unscoped
  // `plumix-plugin-<id>` convention. Anything else needs to declare
  // its own resolution path, out of scope for this slice.
  const candidates = [
    `@plumix/plugin-${pluginId}`,
    `plumix-plugin-${pluginId}`,
  ];
  for (const name of candidates) {
    try {
      return dirname(require.resolve(`${name}/package.json`));
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The directory admin's `import.meta.glob("../../../plugins/*"/locales/*.mjs")`
 * scans. That glob is written from `packages/admin/src/lib`, so the directory
 * is the admin package's own sibling — which makes the installed
 * `@plumix/admin` the anchor, rather than the shape of any path.
 *
 * Canonicalized once here so `isAdminBundledPlugin` can compare it against a
 * resolved link without paying a throwing syscall per plugin, and `null`
 * anywhere but the plumix monorepo: a consumer's installed admin has no such
 * sibling, so nothing is baked in and every plugin needs a URL.
 */
export function findAdminBundledPluginsDir(
  adminPackageRoot: string,
): string | null {
  try {
    return realpathSync(resolve(adminPackageRoot, "../plugins"));
  } catch {
    return null;
  }
}

/**
 * Detect whether a plugin's admin catalogs are already baked into the admin
 * bundle by that glob, so the manifest layer can skip `pluginI18n` URL
 * emission and spare admin a double-load at boot.
 *
 * Under pnpm every `node_modules` entry is a symlink — registry tarballs
 * included — so symlink-ness says nothing about a plugin's provenance. What
 * settles it is where the entry resolves to: only a target sitting in
 * `bundledPluginsDir` is in the bundle.
 *
 * Scoped to the `@plumix/plugin-<id>` convention only — `packages/plugins/*`
 * houses `@plumix/`-scoped plugins by convention, so a workspace plugin under
 * another name isn't covered by admin's glob either and does need a URL.
 *
 * Every unanticipated failure lands on `false`, which is the safe direction:
 * a wrong `false` costs a redundant catalog fetch, a wrong `true` costs
 * silently-English admin strings.
 */
export function isAdminBundledPlugin(input: {
  readonly pluginId: string;
  readonly projectRoot: string;
  readonly bundledPluginsDir: string | null;
}): boolean {
  const { bundledPluginsDir } = input;
  if (bundledPluginsDir === null) return false;
  const entryPath = resolve(
    input.projectRoot,
    "node_modules",
    "@plumix",
    `plugin-${input.pluginId}`,
  );
  try {
    return dirname(realpathSync(entryPath)) === bundledPluginsDir;
  } catch {
    return false;
  }
}
