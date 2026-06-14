import type { ResolvedLocale } from "../i18n/locale-registry.js";

export function rewriteAdminShellLangDir(
  html: string,
  locale: ResolvedLocale,
): string {
  return html.replace(
    /<html\b[^>]*>/i,
    `<html lang="${locale.code}" dir="${locale.direction}">`,
  );
}

/**
 * Insert a `<base href>` at the top of the admin shell's `<head>` so the
 * relative-based client bundle resolves its assets — and the client router /
 * RPC base — against the directory the admin is actually mounted under
 * (`/custom-directory/_plumix/admin/` behind a subdirectory proxy, plain
 * `/_plumix/admin/` at the root). No-op when there's no `<head>` to anchor to.
 */
export function injectAdminBaseHref(html: string, href: string): string {
  return html.replace(
    /<head\b[^>]*>/i,
    (head) => `${head}<base href="${href}">`,
  );
}
