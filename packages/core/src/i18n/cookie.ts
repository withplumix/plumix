import { withBasePath } from "../base-path.js";

// `Path=/_plumix/` keeps it off public-route requests, so public HTML stays
// identical across visitors and caches don't fragment.
export const ADMIN_LOCALE_COOKIE = "plumix_locale";
const ADMIN_LOCALE_COOKIE_PATH = "/_plumix/";
const ONE_YEAR_SECONDS = 31_536_000;

/**
 * `code` is written raw, so pass only registry-matched codes. `Secure` is
 * appended only over HTTPS.
 */
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
