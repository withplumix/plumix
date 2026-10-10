import { isLoopbackOrigin } from "../auth/csrf.js";

/**
 * Host stands in for the bind interface; DNS rebinding leaves the attacker's
 * domain there. No `PLUMIX_DEV` check, so worker code wants
 * {@link isTrustedDevRequest}.
 */
export function isTrustedDevHost(host: string | undefined): boolean {
  if (process.env.PLUMIX_DEV_ALLOW_REMOTE) return true;
  return host !== undefined && isLoopbackOrigin(`http://${host}`);
}

/** Statically `false` in production: both literals are Vite-substituted. */
export function isTrustedDevRequest(request: Request): boolean {
  if (!process.env.PLUMIX_DEV) return false;
  // A Request's URL is always absolute and already parsed — construction
  // rejects anything else — so this cannot throw.
  return isTrustedDevHost(new URL(request.url).host);
}
