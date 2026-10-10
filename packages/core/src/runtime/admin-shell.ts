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

/** No-op when the shell has no `<head>`. */
export function injectAdminBaseHref(html: string, href: string): string {
  return html.replace(
    /<head\b[^>]*>/i,
    (head) => `${head}<base href="${href}">`,
  );
}
