import { isLoopbackOrigin } from "../auth/csrf.js";

/**
 * Whether a request that reached a development surface came from the developer
 * running the server (#2007).
 *
 * The Host is the proxy for the bind interface, the same signal
 * `resolveMcpDevTrust` reads — an honest client reaching an exposed dev server
 * targets the exposed name, and DNS rebinding leaves the attacker's domain
 * there too. A non-browser attacker already on the LAN can forge
 * `Host: localhost`, the accepted dev-only residual MCP already takes.
 * `PLUMIX_DEV_ALLOW_REMOTE` is the deliberate opt-out;
 * `apps/docs/.../going-further/dev-server.mdx` documents both.
 *
 * No `PLUMIX_DEV` check here: this is for the Vite plugin's own dev
 * middlewares, which live in `configureServer` and so cannot exist in a build —
 * and where `process.env.PLUMIX_DEV` is unset anyway, being a bundle define
 * rather than something the dev server's Node process carries. Anything running
 * in the worker wants {@link isTrustedDevRequest}, which adds that gate.
 */
export function isTrustedDevHost(host: string | undefined): boolean {
  if (process.env.PLUMIX_DEV_ALLOW_REMOTE) return true;
  return host !== undefined && isLoopbackOrigin(`http://${host}`);
}

/**
 * The second factor behind the development gate: `PLUMIX_DEV` says a dev server
 * is running, this says the request reached it over loopback. Both literals are
 * Vite-substituted and empty for a build, so this is statically `false` in
 * production.
 */
export function isTrustedDevRequest(request: Request): boolean {
  if (!process.env.PLUMIX_DEV) return false;
  // A Request's URL is always absolute and already parsed — construction
  // rejects anything else — so this cannot throw.
  return isTrustedDevHost(new URL(request.url).host);
}
