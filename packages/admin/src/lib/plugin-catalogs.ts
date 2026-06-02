import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

import type { PluginI18nManifest } from "@plumix/core/manifest";

interface PluginCatalogLoaderInput {
  readonly manifest: PluginI18nManifest;
  readonly importCatalog?: (url: string) => Promise<{ messages: Messages }>;
}

/** Build a `loadPluginCatalog(pluginId, locale)` function bound to a
 *  manifest snapshot. Resolves the URL declared in
 *  `manifest[pluginId].catalogs[locale]` via dynamic `import()` (the
 *  catalog is a standard ES module — `export const messages = {...}`),
 *  and merges the loaded `messages` into the active Lingui instance.
 *  No-op when the manifest doesn't declare a URL for that (plugin,
 *  locale): missing catalog means the plugin's `<Trans>` calls fall
 *  through to `descriptor.message`. */
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
    // The IIFE never rejects: failures swallow inside the catch. The
    // boot path (`Promise.all` in `bootI18n`) relies on this — a
    // single broken plugin must not abort the mount. Pulling the
    // try/catch out of this closure would silently break that
    // contract.
    const promise = (async () => {
      try {
        const mod = await importCatalog(url);
        // `i18n.load(locale, messages)` merges via Object.assign
        // internally — no need to spread `i18n.messages` (which is
        // the *active* locale's bucket, not `locale`'s; spreading
        // would copy active strings into the wrong bucket when this
        // is called for a non-active locale, e.g., via
        // `window.plumix.i18n.loadPluginCatalog`).
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
