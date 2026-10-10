import type { JsonObject } from "../json.js";
import type { ResolvedI18nFor, ResolvedLocale } from "./locale-registry.js";
import { readCookie } from "../read-cookie.js";
import { matchAcceptLanguage } from "./accept-language.js";
import { ADMIN_LOCALE_COOKIE } from "./cookie.js";
import { findEnabledLocale } from "./locale-registry.js";

/**
 * The user is whatever the site's override is handed; this reads only the
 * stored `meta` bag, for `meta.locale`.
 */
interface LocaleUser {
  readonly meta: JsonObject;
}

interface ResolveLocaleArgs<TUser extends LocaleUser> {
  readonly request: Request;
  readonly user: TUser | null;
  readonly i18n: ResolvedI18nFor<TUser>;
}

/**
 * The override fires on admin SSR too; operators who want admin to ignore it
 * narrow it on the request path.
 */
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
  // Public HTML must stay identical per URL so CDN cache keys don't fragment.
  // The browser already path-gates the cookie.
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
