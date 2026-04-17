export const SESSION_COOKIE_NAME = "plumix_session";

export interface SessionCookieOptions {
  readonly name?: string;
  /** Cookie Max-Age in seconds. Mirrors the session's sliding TTL. */
  readonly maxAgeSeconds: number;
  /** Set Secure when serving over HTTPS — auto-detected from request URL. */
  readonly secure: boolean;
  readonly sameSite?: "Lax" | "Strict" | "None";
  readonly path?: string;
  readonly domain?: string;
}

/**
 * Build a Set-Cookie value following Copenhagen Book guidance:
 * HttpOnly + Secure-when-https + SameSite=Lax + explicit Max-Age + Path=/.
 * Domain is intentionally omitted (host-only cookies are stricter than wildcard).
 */
export function buildSessionCookie(
  value: string,
  options: SessionCookieOptions,
): string {
  const {
    name = SESSION_COOKIE_NAME,
    maxAgeSeconds,
    secure,
    sameSite = "Lax",
    path = "/",
    domain,
  } = options;

  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push("Secure");
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/** Build a Set-Cookie that immediately deletes the session cookie. */
export function buildSessionDeletionCookie(
  options: Omit<SessionCookieOptions, "maxAgeSeconds">,
): string {
  const {
    name = SESSION_COOKIE_NAME,
    secure,
    sameSite = "Lax",
    path = "/",
    domain,
  } = options;
  const parts = [
    `${name}=`,
    `Path=${path}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push("Secure");
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/**
 * Parse a single named cookie out of a request's Cookie header. We accept
 * the cookie ONLY from the Cookie header — never from URL or form (Copenhagen
 * Book explicit rule: session IDs must not be readable from form submissions
 * or query parameters).
 */
export function readSessionCookie(
  request: Request,
  name: string = SESSION_COOKIE_NAME,
): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const value = part.slice(eq + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

/** True when the request was served over HTTPS — controls the Secure flag. */
export function isSecureRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}
