/** Same-origin so the default CSP `script-src 'self'` covers the dynamic
 *  import; CDN-hosted catalogs would need a CSP review. */
export function pluginCatalogUrl(pluginId: string, locale: string): string {
  return `/_plumix/admin/${pluginCatalogStagedPath(pluginId, locale)}`;
}

/** Filesystem path (relative to the admin asset root) where the plumix
 *  Vite plugin must stage `<plugin.i18n.catalogPath>/<locale>.mjs`.
 *  `pluginCatalogUrl` builds on it, so one edit retargets both ends. */
export function pluginCatalogStagedPath(
  pluginId: string,
  locale: string,
): string {
  return `plugins/${pluginId}/locales/${locale}.mjs`;
}
