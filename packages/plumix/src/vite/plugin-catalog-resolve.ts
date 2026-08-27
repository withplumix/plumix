import { realpathSync } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

import type { AnyPluginDescriptor, PlumixManifest } from "@plumix/core";
import { pluginCatalogStagedPath } from "@plumix/core";

import { VitePluginError } from "./errors.js";

/**
 * Package-name candidates for a plugin id, most specific first: the first-party
 * `@plumix/plugin-<id>` scope, then the unscoped `plumix-plugin-<id>` community
 * convention.
 *
 * `PLUGIN_ID_RE` admits `_`, npm names conventionally use `-`, and nothing makes
 * a plugin reconcile the two — `audit_log` ships as `@plumix/plugin-audit-log`.
 * So an id carrying `_` gets a hyphenated candidate for each convention, tried
 * after the literal one: a plugin whose package really does contain `_` still
 * resolves on the literal, and the fallback only runs when that missed.
 */
function packageNameCandidates(pluginId: string): string[] {
  const ids = pluginId.includes("_")
    ? [pluginId, pluginId.replaceAll("_", "-")]
    : [pluginId];
  return ids.flatMap((id) => [`@plumix/plugin-${id}`, `plumix-plugin-${id}`]);
}

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
  for (const name of packageNameCandidates(pluginId)) {
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
  // Same id-to-package-name slack `findPluginPackageRoot` allows: `audit_log`
  // is installed as `@plumix/plugin-audit-log`, and reading the literal id
  // alone reports every such plugin as unbundled.
  return packageNameCandidates(input.pluginId)
    .filter((name) => name.startsWith("@plumix/"))
    .some((name) => {
      const entryPath = resolve(input.projectRoot, "node_modules", name);
      try {
        return dirname(realpathSync(entryPath)) === bundledPluginsDir;
      } catch {
        return false;
      }
    });
}

// admin-served path `buildManifest` published in `pluginI18n[id].catalogs[locale]`
// — admin's runtime loader (#697) does `import(url)` against same-origin paths
// under the default CSP. A missing `.mjs` for a manifest-declared locale is a
// build-time error; the runtime's `descriptor.message` fallback only catches
// post-fetch failures.
export async function stagePluginCatalogs(
  adminDest: string,
  plugins: readonly AnyPluginDescriptor[],
  manifest: PlumixManifest,
  projectRoot: string,
): Promise<void> {
  const pluginI18n = manifest.pluginI18n;
  if (!pluginI18n) return;
  await Promise.all(
    plugins.map(async (plugin) => {
      const entry = pluginI18n[plugin.id];
      // No manifest entry = no `i18n` slot, or every declared locale
      // was filtered out by site-locale intersection in `buildManifest`.
      if (!entry || !plugin.i18n) return;
      const { catalogPath } = plugin.i18n;
      const candidate = await resolveCatalogDir(
        plugin.id,
        catalogPath,
        projectRoot,
      );
      if (candidate === null) {
        // `buildManifest` already committed to emitting catalog URLs
        // for this plugin — if the resolver can't reach the source
        // directory, admin's runtime fetch will 404 in production.
        // Fail the build with the same error shape `adminChunk` /
        // `adminCss` use so plugin authors see it during `plumix build`.
        throw VitePluginError.adminAssetNotFound({
          pluginId: plugin.id,
          field: "i18n.catalogPath",
          declared: catalogPath,
          resolved: catalogPath,
        });
      }
      await Promise.all(
        Object.keys(entry.catalogs).map(async (locale) => {
          const sourceFile = resolve(candidate, `${locale}.mjs`);
          try {
            await stat(sourceFile);
          } catch {
            throw VitePluginError.adminAssetNotFound({
              pluginId: plugin.id,
              field: `i18n.catalogs[${locale}]`,
              declared: `${catalogPath}/${locale}.mjs`,
              resolved: sourceFile,
            });
          }
          const destFile = resolve(
            adminDest,
            pluginCatalogStagedPath(plugin.id, locale),
          );
          await mkdir(dirname(destFile), { recursive: true });
          await copyFile(sourceFile, destFile);
        }),
      );
    }),
  );
}

// Resolve the per-plugin catalog source directory. The npm-name
// convention (workspace + npm-installed plugins) is the only supported
// path; absolute `catalogPath` values are honored verbatim. Returns
// `null` when nothing resolves to an existing directory —
// `stagePluginCatalogs` then throws `adminAssetNotFound` because the
// manifest already committed to a URL admin will fetch.
async function resolveCatalogDir(
  pluginId: string,
  catalogPath: string,
  projectRoot: string,
): Promise<string | null> {
  if (isAbsolute(catalogPath)) {
    try {
      await stat(catalogPath);
      return catalogPath;
    } catch {
      return null;
    }
  }
  const conventional = findPluginPackageRoot({ pluginId, projectRoot });
  if (conventional === null) return null;
  const dir = resolve(conventional, catalogPath);
  try {
    await stat(dir);
    return dir;
  } catch {
    return null;
  }
}
