// Plugin i18n catalog location — the one path both ends of the runtime catalog
// fetch agree on: the URL `buildManifest` emits into the manifest and the
// filesystem path the plumix Vite plugin stages each catalog at. Re-exported
// unchanged from the public `@plumix/core/manifest` barrel.

/** URL the admin runtime fetches to load a plugin's compiled catalog
 *  for a given locale. Same-origin under `/_plumix/admin/...` so the
 *  default CSP `script-src 'self'` covers the dynamic import. Widening
 *  to absolute URLs (CDN-hosted catalogs) would need a CSP review.
 *
 *  Paired with `pluginCatalogStagedPath` — the plumix Vite plugin stages
 *  each plugin's `.mjs` at that filesystem path so the URL resolves. */
export function pluginCatalogUrl(pluginId: string, locale: string): string {
  return `/_plumix/admin/${pluginCatalogStagedPath(pluginId, locale)}`;
}

/** Filesystem path (relative to the admin asset root) where the plumix
 *  Vite plugin must stage `<plugin.i18n.catalogPath>/<locale>.mjs`.
 *  Mirrors `pluginCatalogUrl` so a single edit retargets both ends of
 *  the runtime fetch. */
export function pluginCatalogStagedPath(
  pluginId: string,
  locale: string,
): string {
  return `plugins/${pluginId}/locales/${locale}.mjs`;
}
