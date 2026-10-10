/**
 * Keeps an unbounded attacker string out of the DB and the `Location` header.
 */
const MAX_REDIRECT_LENGTH = 2048;

/**
 * The URL parser strips TAB/CR/LF before parsing, so `/<TAB>/host` becomes
 * `//host` after the `//` check passed.
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Root-relative paths only, stricter than the sign-out sanitiser: a
 * request-supplied value is attacker-controlled.
 */
export function isSafeRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.length > MAX_REDIRECT_LENGTH) return false;
  if (hasControlChar(value)) return false;
  // Backslash anywhere -- `/\evil.com`, `\/evil.com`, `/path\to` all become
  // origin-changing once the browser normalises `\` to `/`.
  if (value.includes("\\")) return false;
  // Must be a root-relative path, and not the protocol-relative `//host`.
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  return true;
}

export function resolveSafeRedirect(
  candidate: unknown,
  fallback: string,
): string {
  return isSafeRedirect(candidate) ? candidate : fallback;
}
