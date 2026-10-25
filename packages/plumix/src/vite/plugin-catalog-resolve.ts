import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

import type { AnyPluginDescriptor, PlumixManifest } from "@plumix/core";
import {
  pluginCatalogStagedPath,
  pluginCatalogUrl,
  projectCatalogLocales,
} from "@plumix/core";

import type { PluginCatalogFile } from "./plugin-catalogs-codegen.js";
import { VitePluginError } from "./errors.js";

/**
 * An id with `_` also gets hyphenated candidates (`audit_log` ships as
 * `@plumix/plugin-audit-log`), tried after the literal.
 */
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
 * Admin's runtime loader `import(url)`s same-origin paths under the default
 * CSP. A missing `.mjs` for a declared locale fails the build.
 */
export async function stagePluginCatalogs(
  adminDest: string,
  plugins: readonly AnyPluginDescriptor[],
  manifest: PlumixManifest,
  projectRoot: string,
): Promise<void> {
  const pluginI18n = manifest.pluginI18n;
  if (!pluginI18n) return;
  // Every catalog is checked before any is copied, so a missing one fails the
  // build without leaving a half-staged admin behind.
  const copies = await Promise.all(
    plugins.map(async (plugin) => {
      const entry = pluginI18n[plugin.id];
      if (!entry || !plugin.i18n) return [];
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
      // Keyed by enabled locale, so several keys may share one catalog.
      const urls = new Set(Object.values(entry.catalogs));
      const staged = new Set(
        [plugin.i18n.sourceLocale, ...plugin.i18n.locales].filter((locale) =>
          urls.has(pluginCatalogUrl(plugin.id, locale)),
        ),
      );
      return Promise.all(
        [...staged].map(async (locale) => {
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
          return {
            sourceFile,
            destFile: resolve(
              adminDest,
              pluginCatalogStagedPath(plugin.id, locale),
            ),
          };
        }),
      );
    }),
  );
  await Promise.all(
    copies.flat().map(async ({ sourceFile, destFile }) => {
      await mkdir(dirname(destFile), { recursive: true });
      await copyFile(sourceFile, destFile);
    }),
  );
}

/**
 * Keyed by the source and enabled locales, each at its catalog locale's file.
 * A declared locale with no compiled file ships nothing: SSR falls back to
 * each descriptor's English source.
 */
export async function collectPluginCatalogFiles(
  plugins: readonly AnyPluginDescriptor[],
  enabled: readonly string[],
  projectRoot: string,
): Promise<Map<string, PluginCatalogFile[]>> {
  const files = new Map<string, PluginCatalogFile[]>();
  for (const plugin of plugins) {
    if (!plugin.i18n) continue;
    const { sourceLocale, catalogPath } = plugin.i18n;
    const dir = await resolveCatalogDir(plugin.id, catalogPath, projectRoot);
    if (dir === null) continue;
    const compiled = new Set<string>();
    for (const locale of plugin.i18n.locales) {
      try {
        await stat(resolve(dir, `${locale}.mjs`));
        compiled.add(locale);
      } catch {
        continue;
      }
    }
    const projected = projectCatalogLocales(
      [sourceLocale, ...enabled],
      [...compiled],
      sourceLocale,
    );
    for (const [locale, catalog] of Object.entries(projected)) {
      if (!compiled.has(catalog)) continue;
      const file = {
        path: resolve(dir, `${catalog}.mjs`),
        source: catalog === sourceLocale,
      };
      files.set(locale, [...(files.get(locale) ?? []), file]);
    }
  }
  return files;
}

/**
 * Absolute `catalogPath` values are honored verbatim; otherwise only the
 * npm-name convention.
 */
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
