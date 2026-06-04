// Underscore-cased to match `plumix_session` prior art in `auth/cookies.ts`.
// `Path=/_plumix/admin/` keeps the browser from sending the cookie on
// public-route requests — public HTML stays identical across visitors so
// cache layers don't fragment.
export const ADMIN_LOCALE_COOKIE = "plumix_locale";
const ADMIN_LOCALE_COOKIE_PATH = "/_plumix/admin/";
const ONE_YEAR_SECONDS = 31_536_000;

/** `code` is written raw — caller is the validation seam (only
 *  registry-matched codes should reach here). `Secure` is appended only
 *  over HTTPS; jsdom tests pass `false` to bypass. */
export function buildLocaleCookie(code: string, secure: boolean): string {
  const parts = [
    `${ADMIN_LOCALE_COOKIE}=${code}`,
    `Path=${ADMIN_LOCALE_COOKIE_PATH}`,
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
