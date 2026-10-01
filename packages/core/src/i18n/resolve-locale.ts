import type { JsonObject } from "../json.js";
import type { ResolvedI18nFor, ResolvedLocale } from "./locale-registry.js";
import { readCookie } from "../read-cookie.js";
import { matchAcceptLanguage } from "./accept-language.js";
import { ADMIN_LOCALE_COOKIE } from "./cookie.js";
import { findEnabledLocale } from "./locale-registry.js";

// The user is whatever the site's override is handed; this reads only the
// stored `meta` bag, for `meta.locale`.
interface LocaleUser {
  readonly meta: JsonObject;
}

interface ResolveLocaleArgs<TUser extends LocaleUser> {
  readonly request: Request;
  readonly user: TUser | null;
  readonly i18n: ResolvedI18nFor<TUser>;
}

// Single source of truth for admin SSR, RPC, and public-route surfaces.
// The override now fires on admin SSR too (pre-merge admin-shell skipped
// it); operators who want admin to ignore the override should narrow it
// on the request path themselves.
export function resolveLocale<TUser extends LocaleUser>({
  request,
  user,
  i18n,
}: ResolveLocaleArgs<TUser>): ResolvedLocale {
  const resolveCode = (
    code: string | null | undefined,
  ): ResolvedLocale | null =>
    code ? (findEnabledLocale(i18n, code) ?? null) : null;

  const override = i18n.resolveLocale?.(request, user);
  const url = new URL(request.url);
  // Path-gate to `/_plumix/*` so public-route HTML stays identical per URL —
  // CDN cache keys must not fragment by browser locale or admin-user prefs,
  // and the public site is the WP-style frontend zone where user.meta.locale
  // is irrelevant. The cookie is already path-gated by the browser via its
  // `Path=/_plumix/` attribute; we don't re-check the URL for it.
  const onInternalPath = url.pathname.startsWith("/_plumix/");
  const userLocale =
    onInternalPath && typeof user?.meta.locale === "string"
      ? user.meta.locale
      : null;

  return (
    resolveCode(override?.code) ??
    resolveCode(url.searchParams.get("lang")) ??
    resolveCode(userLocale) ??
    resolveCode(readCookie(request, ADMIN_LOCALE_COOKIE)) ??
    (onInternalPath ? matchAcceptLanguage(request, i18n) : null) ??
    i18n.defaultLocale
  );
}
