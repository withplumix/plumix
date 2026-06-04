// `buildLocaleCookie` produces the same byte-string as the server-side
// `Set-Cookie` writer (`Path=/_plumix/`) so a pre-auth pick and a post-auth
// pick are byte-identical and the unified `resolveLocale` reads either.
import { buildLocaleCookie } from "@plumix/core/i18n";

/** Builds the next search-param object when the login locale dropdown
 *  changes. Always sets `?lang=`, even when the chosen code matches
 *  the site default, because the admin shell's Accept-Language fallback
 *  may otherwise resolve the request to something other than the
 *  user's pick on reload. */
export function nextSearchForLang(
  currentSearch: Record<string, unknown>,
  nextCode: string,
): Record<string, unknown> {
  const { lang: _drop, ...rest } = currentSearch;
  return { ...rest, lang: nextCode };
}

/** Pins `?lang=` so the next SSR resolves to the chosen locale
 *  before the cookie is visible on the wire, preserving sibling
 *  search params (`oauth_error`, `redirect_to`, etc.). */
export function buildLocaleSwitchUrl(
  currentSearch: Record<string, unknown>,
  nextCode: string,
): string {
  const nextSearch = nextSearchForLang(currentSearch, nextCode);
  const params = new URLSearchParams();
  for (const [k, raw] of Object.entries(nextSearch)) {
    if (typeof raw === "string") params.set(k, raw);
    else if (typeof raw === "number") params.set(k, String(raw));
  }
  return `${window.location.pathname}?${params.toString()}`;
}

/** `secure` defaults to the current scheme; tests pass `false` to
 *  bypass HTTPS-only enforcement in jsdom. */
export function writeLocaleCookie(
  code: string,
  options: { readonly secure?: boolean } = {},
): void {
  const secure =
    options.secure ??
    (typeof location !== "undefined" && location.protocol === "https:");
  document.cookie = buildLocaleCookie(code, secure);
}
