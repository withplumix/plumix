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

// Invariant: keep these in lockstep with `ADMIN_LOCALE_COOKIE` /
// `ADMIN_LOCALE_COOKIE_PATH` in `packages/core/src/runtime/admin-shell.ts`
// and `ONE_YEAR_SECONDS` in
// `packages/core/src/rpc/procedures/user/set-locale.ts`. A drift means
// the pre-auth cookie this writes won't be read by the SSR resolver, or
// the post-auth user.setLocale will write under a different name and
// the two persistence paths diverge. No subpath export from `@plumix/core`
// covers these yet; drop the duplication once one lands.
const ADMIN_LOCALE_COOKIE = "plumix_locale";
const ADMIN_LOCALE_COOKIE_PATH = "/_plumix/admin/";
const ONE_YEAR_SECONDS = 31_536_000;

/** Serializes a `plumix_locale` cookie string with the same attributes
 *  the post-auth `user.setLocale` server writer uses, so a pick at
 *  login and a later pick in profile produce byte-identical persistence.
 *  `code` is written raw (matching server semantics); the dropdown is
 *  the validation seam — only registry-matched codes reach here. */
export function buildLocaleCookie(code: string, secure: boolean): string {
  /* eslint-disable lingui/no-unlocalized-strings -- HTTP cookie attributes, not user-visible text */
  const parts = [
    `${ADMIN_LOCALE_COOKIE}=${code}`,
    `Path=${ADMIN_LOCALE_COOKIE_PATH}`,
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  /* eslint-enable lingui/no-unlocalized-strings */
  return parts.join("; ");
}

/** Side-effect wrapper. `secure` defaults to the current scheme; tests
 *  pass `false` to bypass HTTPS-only enforcement in jsdom. */
export function writeLocaleCookie(
  code: string,
  options: { readonly secure?: boolean } = {},
): void {
  const secure =
    options.secure ??
    (typeof location !== "undefined" && location.protocol === "https:");
  document.cookie = buildLocaleCookie(code, secure);
}
