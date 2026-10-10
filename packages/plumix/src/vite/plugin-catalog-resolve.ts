import { realpathSync } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

import type { AnyPluginDescriptor, PlumixManifest } from "@plumix/core";
import { pluginCatalogStagedPath } from "@plumix/core";

import type { PluginCatalogFile } from "./plugin-catalogs-codegen.js";
import { VitePluginError } from "./errors.js";

// An id with `_` also gets hyphenated candidates (`audit_log` ships as
// `@plumix/plugin-audit-log`), tried after the literal.
function packageNameCandidates(pluginId: string): string[] {
  const ids = pluginId.includes("_")
    ? [pluginId, pluginId.replaceAll("_", "-")]
    : [pluginId];
  return ids.flatMap((id) => [`@plumix/plugin-${id}`, `plumix-plugin-${id}`]);
}

/**
 * Returns `null` if no npm-name convention resolves. `requireFrom` is a test
 * seam.
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
 * The directory admin's `import.meta.glob` bakes plugin catalogs from. `null`
 * anywhere but the plumix monorepo, where nothing is baked in.
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
 * Decided by where the entry resolves to: under pnpm every entry is a symlink.
 * Any failure returns `false`, the safe direction: a redundant catalog fetch
 * beats silently-English admin strings.
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

// Admin's runtime loader `import(url)`s same-origin paths under the default
// CSP. A missing `.mjs` for a declared locale fails the build.
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
        // `buildManifest` already committed to a catalog URL, so admin's fetch
        // would 404 in production.
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

/**
 * A declared locale with no compiled file is skipped: SSR falls back to each
 * descriptor's English source.
 */
export async function collectPluginCatalogFiles(
  plugins: readonly AnyPluginDescriptor[],
  projectRoot: string,
): Promise<Map<string, PluginCatalogFile[]>> {
  const files = new Map<string, PluginCatalogFile[]>();
  for (const plugin of plugins) {
    if (!plugin.i18n) continue;
    const dir = await resolveCatalogDir(
      plugin.id,
      plugin.i18n.catalogPath,
      projectRoot,
    );
    if (dir === null) continue;
    for (const locale of plugin.i18n.locales) {
      const file = resolve(dir, `${locale}.mjs`);
      try {
        await stat(file);
      } catch {
        continue;
      }
      const source = locale === plugin.i18n.sourceLocale;
      files.set(locale, [...(files.get(locale) ?? []), { path: file, source }]);
    }
  }
  return files;
}

// Absolute `catalogPath` values are honored verbatim; otherwise only the
// npm-name convention.
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
