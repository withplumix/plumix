import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

import type { PluginI18nManifest } from "@plumix/core/manifest";

interface PluginCatalogLoaderInput {
  readonly manifest: PluginI18nManifest;
  readonly importCatalog?: (url: string) => Promise<{ messages: Messages }>;
}

/**
 * The loader no-ops when the manifest declares no catalog for that plugin and
 * locale.
 */
export function createPluginCatalogLoader({
  manifest,
  importCatalog = (url) => import(/* @vite-ignore */ url),
}: PluginCatalogLoaderInput): (
  pluginId: string,
  locale: string,
) => Promise<void> {
  // Cache by `(pluginId, locale)` so repeat calls (e.g., a chunk that
  // re-mounts) don't refetch. Storing the in-flight promise also
  // dedups concurrent calls.
  const inflight = new Map<string, Promise<void>>();
  return function loadPluginCatalog(pluginId, locale) {
    const url = manifest[pluginId]?.catalogs[locale];
    if (!url) return Promise.resolve();
    const key = `${pluginId}|${locale}`;
    const cached = inflight.get(key);
    if (cached) return cached;
    // Never rejects: `bootI18n`'s `Promise.all` relies on one broken plugin not
    // aborting the mount.
    const promise = (async () => {
      try {
        const mod = await importCatalog(url);
        // Already merges; spreading `i18n.messages` would copy the active
        // locale's strings into a non-active locale's bucket.
        i18n.load(locale, mod.messages);
      } catch (error) {
        console.error(
          `[plumix] failed to load catalog for ${pluginId} (${locale})`,
          error,
        );
      }
    })();
    inflight.set(key, promise);
    return promise;
  };
}
