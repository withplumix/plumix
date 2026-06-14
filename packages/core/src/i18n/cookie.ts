import { withBasePath } from "../base-path.js";

// Underscore-cased to match `plumix_session` prior art in `auth/cookies.ts`.
// `Path=/_plumix/` keeps the browser from sending the cookie on public-route
// requests (public HTML stays identical across visitors so cache layers
// don't fragment) while letting it reach all internal endpoints — the admin
// shell SSR, auth POSTs (magic-link, OAuth callbacks), and the RPC pipeline.
// `resolveLocale` reads the same cookie across all three surfaces.
export const ADMIN_LOCALE_COOKIE = "plumix_locale";
const ADMIN_LOCALE_COOKIE_PATH = "/_plumix/";
const ONE_YEAR_SECONDS = 31_536_000;

/** `code` is written raw — caller is the validation seam (only
 *  registry-matched codes should reach here). `Secure` is appended only
 *  over HTTPS; jsdom tests pass `false` to bypass. `basePath` scopes the
 *  cookie under a subdirectory mount so the browser actually sends it back
 *  (and it matches the session cookie's scope); `""` keeps `Path=/_plumix/`. */
export function buildLocaleCookie(
  code: string,
  secure: boolean,
  basePath = "",
): string {
  const parts = [
    `${ADMIN_LOCALE_COOKIE}=${code}`,
    `Path=${withBasePath(ADMIN_LOCALE_COOKIE_PATH, basePath)}`,
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
