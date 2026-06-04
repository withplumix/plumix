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
