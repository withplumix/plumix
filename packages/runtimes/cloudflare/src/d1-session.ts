export const DEFAULT_BOOKMARK_COOKIE = "__plumix_d1_bookmark";

/** Observed bookmarks are ~60 chars, but the format is opaque. */
export const MAX_BOOKMARK_LENGTH = 1024;

/**
 * Shape isn't validated, so a future format can't silently degrade
 * read-your-writes; length and control characters are.
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
 * No Max-Age: the Sessions API rejects stale bookmarks, so expiring at browser
 * close is correct.
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
