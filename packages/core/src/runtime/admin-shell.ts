import type { AuthenticatedUser } from "../context/app.js";
import type { ResolvedI18n, ResolvedLocale } from "../i18n/locale-registry.js";
import { readSessionCookie } from "../auth/cookies.js";
import { findEnabledLocale } from "../i18n/locale-registry.js";

// Scoped `Path=/_plumix/admin/` at write-time so it never reaches public
// routes — keeps public HTML identical across visitors for cache layers.
const ADMIN_LOCALE_COOKIE = "plumix-locale";

export function rewriteAdminShellLangDir(
  html: string,
  locale: ResolvedLocale,
): string {
  return html.replace(
    /<html\b[^>]*>/i,
    `<html lang="${locale.code}" dir="${locale.direction}">`,
  );
}

// WP wp-login.php parity: ?lang= → user.meta.locale → plumix-locale cookie
// → site default. Each candidate validated against the registry. The
// `i18n.resolveLocale` operator override is intentionally NOT consulted —
// admin shell follows the WP wp_lang chain; the public-route resolver is
// the place to layer custom resolution.
export function resolveAdminShellLocale(args: {
  readonly request: Request;
  readonly user: AuthenticatedUser | null;
  readonly i18n: ResolvedI18n;
}): ResolvedLocale {
  const fromQuery = new URL(args.request.url).searchParams.get("lang");
  if (fromQuery) {
    const match = findEnabledLocale(args.i18n, fromQuery);
    if (match) return match;
  }
  if (typeof args.user?.meta.locale === "string") {
    const match = findEnabledLocale(args.i18n, args.user.meta.locale);
    if (match) return match;
  }
  const fromCookie = readSessionCookie(args.request, ADMIN_LOCALE_COOKIE);
  if (fromCookie) {
    const match = findEnabledLocale(args.i18n, fromCookie);
    if (match) return match;
  }
  return args.i18n.defaultLocale;
}
