export const DEFAULT_BOOKMARK_COOKIE = "__plumix_d1_bookmark";

// D1 bookmarks observed in the wild are ~60 chars, but the format is opaque
// and future encodings could be longer. Err on the generous side — cookie
// values max out at ~4 KB anyway.
export const MAX_BOOKMARK_LENGTH = 1024;

/**
 * Bookmarks are opaque tokens minted by Cloudflare. We don't validate the
 * shape (a tighter regex risks rejecting a future format change and silently
 * degrading read-your-writes), but we do cap length and reject control
 * characters so a malicious or corrupt cookie can't smuggle anything weird
 * into `withSession`.
 */
export function isValidBookmark(value: string): boolean {
  if (value.length === 0 || value.length > MAX_BOOKMARK_LENGTH) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/**
 * Build a Set-Cookie value for the bookmark. No Max-Age — bookmark cookies
 * are only useful while a D1 replica is at-or-past them; stale bookmarks
 * are rejected by the Sessions API and we fall back to the default constraint.
 * Letting them expire at browser close is correct.
 */
export function buildBookmarkCookie(
  value: string,
  name: string,
  secure: boolean,
): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
