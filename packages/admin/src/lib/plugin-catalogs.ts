import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

import type { PluginI18nManifest } from "@plumix/core/manifest";
import { loadOnce } from "@plumix/core/support";

import { adminBasePath } from "./admin-base.js";

interface PluginCatalogLoaderInput {
  readonly manifest: PluginI18nManifest;
  /** The site's mount; the manifest's URLs are root-absolute without it. */
  readonly basePath?: string;
  readonly importCatalog?: (url: string) => Promise<{ messages: Messages }>;
}

/**
 * Falls back to the source catalog because a production admin can't compile
 * `descriptor.message`: without one, a placeholder renders raw.
 */
export function createPluginCatalogLoader({
  manifest,
  basePath = adminBasePath(),
  // A loader per call: the URL varies, and the browser keeps one module per URL.
  importCatalog = (url) => loadOnce(() => import(/* @vite-ignore */ url))(),
}: PluginCatalogLoaderInput): (
  pluginId: string,
  locale: string,
) => Promise<void> {
  // Cache by `(pluginId, locale)` so repeat calls (e.g., a chunk that
  // re-mounts) don't refetch. Storing the in-flight promise also
  // dedups concurrent calls.
  const inflight = new Map<string, Promise<void>>();
  return function loadPluginCatalog(pluginId, locale) {
    const entry = manifest[pluginId];
    const path = entry?.catalogs[locale] ?? entry?.catalogs[entry.sourceLocale];
    if (!path) return Promise.resolve();
    // `<base href>` doesn't reach a root-absolute specifier, and `import()`
    // resolves a relative one against this module, not the page.
    const url = `${basePath}${path}`;
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
