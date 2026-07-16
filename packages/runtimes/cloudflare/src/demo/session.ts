import { buildSessionCookie, isSecureRequest, readSessionCookie } from "plumix";

import type { DemoDB } from "./demo-db.js";
import { DemoError } from "../errors.js";

/** Cookie holding the per-visitor demo session token. */
export const DEMO_COOKIE_NAME = "plumix_demo";

/** Readable (non-HttpOnly) cookie holding the session's expiry epoch (ms), so
 * the toolbar countdown can read it client-side. */
export const DEMO_EXPIRES_COOKIE_NAME = "plumix_demo_expires";

/** How long a demo sandbox lives before its Durable Object self-cleans. */
export const DEMO_TTL_SECONDS = 3600;

/**
 * Durable Object name for the shared, read-only "showcase" database that
 * serves cookieless visitors the public blog before they start their own
 * session. One instance for everyone — a bot browsing spawns no per-session DOs.
 */
export const DEMO_SHOWCASE_NAME = "__plumix_demo_showcase__";

/**
 * Read the demo session token from the request cookie, or null if absent.
 *
 * A client-supplied token equal to the reserved showcase name is treated as
 * absent: the cookie is an opaque, unsigned DO name, so without this a visitor
 * could forge `plumix_demo=<showcase name>` to be authenticated as admin
 * operating directly on the shared showcase database. Rejecting it here closes
 * every consumer at once — auth stays anonymous, the admin redirects to /demo,
 * and the database falls back to the showcase as a read-only reader.
 */
export function readDemoToken(request: Request): string | null {
  const token = readSessionCookie(request, DEMO_COOKIE_NAME);
  return token === DEMO_SHOWCASE_NAME ? null : token;
}

/**
 * Whether the request carries a demo session — true for a provisioned visitor
 * (and inside the editor's live preview, which is same-origin), false for the
 * anonymous showcase. Themes use it to show the "Try the editor" CTA to
 * newcomers only. `ctx.user` can't stand in here: core only resolves the user
 * on public routes when the *default* session cookie is present, so a custom
 * authenticator's session (like the demo's) leaves `ctx.user` null.
 */
export function hasDemoSession(request: Request): boolean {
  return readDemoToken(request) !== null;
}

/** Set-Cookie value that binds a visitor to their session for the TTL. */
export function demoSessionCookie(token: string, request: Request): string {
  return buildSessionCookie(token, {
    name: DEMO_COOKIE_NAME,
    maxAgeSeconds: DEMO_TTL_SECONDS,
    secure: isSecureRequest(request),
  });
}

/**
 * Set-Cookie carrying the session's expiry epoch (ms) for the toolbar
 * countdown. Not HttpOnly on purpose — the client script reads it.
 */
export function demoExpiresCookie(request: Request): string {
  const expiresAt = Date.now() + DEMO_TTL_SECONDS * 1000;
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `${DEMO_EXPIRES_COOKIE_NAME}=${expiresAt}; SameSite=Lax; Path=/; Max-Age=${DEMO_TTL_SECONDS}${secure}`;
}

/** Set-Cookie values that clear the demo session (used by reset). */
export function clearDemoCookies(): string[] {
  const expired = "Path=/; Max-Age=0";
  return [
    `${DEMO_COOKIE_NAME}=; HttpOnly; SameSite=Lax; ${expired}`,
    `${DEMO_EXPIRES_COOKIE_NAME}=; SameSite=Lax; ${expired}`,
  ];
}

/** Resolve the visitor's own DemoDB Durable Object from their session token. */
export function demoStub(
  env: unknown,
  binding: string,
  token: string,
): DurableObjectStub<DemoDB> {
  const namespaces = env as Record<
    string,
    DurableObjectNamespace<DemoDB> | undefined
  >;
  const namespace = namespaces[binding];
  if (!namespace) {
    throw DemoError.bindingMissing({ binding });
  }
  return namespace.get(namespace.idFromName(token));
}
