/**
 * Same-origin, path-only redirect validation -- the shared guard every
 * "return to where you came from" flow (OAuth start/callback, magic-link
 * verify, and the later access-gating work) runs an untrusted `redirectTo`
 * through before honouring it as a navigation target.
 *
 * A safe destination is a root-relative path (`/...`) and nothing else: no
 * absolute URL, no protocol-relative `//host`, no backslash (browsers
 * normalise `\` to `/`, so `/\host` escapes to `//host`), no `javascript:`
 * / `data:` pseudo-scheme, no control characters. Anything else falls back
 * to a caller-supplied default. Stricter than the sign-out URL sanitiser
 * (which also permits `https://` absolutes for external IdP logout) because
 * a request-supplied `redirectTo` is fully attacker-controlled -- an accepted
 * off-origin value is an open redirect.
 *
 * Mirrors emdash's `isSafeRedirect` test matrix.
 */

// Bounds the value written into the OAuth `state` row and the emailed verify
// URL. Generous for any real return-to path while keeping an unbounded
// attacker string out of the DB / `Location` header.
const MAX_REDIRECT_LENGTH = 2048;

// True when the string contains any C0 control char (U+0000-U+001F, incl.
// TAB) or DEL (U+007F). The WHATWG URL parser strips TAB/CR/LF from a URL
// *before* parsing, so a bare `/<TAB>/host` would reconstruct to `//host`
// (protocol-relative) after the `//` check has already passed -- the whole
// range must go, not just CR/LF. A char-code scan keeps this source ASCII-only
// (no literal control bytes in a regex, no `no-control-regex` suppression).
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

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

/**
 * Return `candidate` when it passes {@link isSafeRedirect}, otherwise the
 * caller's `fallback` (typically today's admin destination). The single
 * decision point flows use so an unsafe or absent value can never become a
 * navigation target.
 */
export function resolveSafeRedirect(
  candidate: unknown,
  fallback: string,
): string {
  return isSafeRedirect(candidate) ? candidate : fallback;
}
