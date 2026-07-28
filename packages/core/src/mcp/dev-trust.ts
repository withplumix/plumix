import type { AppContext } from "../context/app.js";
import { isLoopbackHostname, isLoopbackOrigin } from "../auth/csrf.js";

/**
 * How the MCP endpoint should authenticate a request:
 *
 * - `"trusted"` — dev over loopback with an allowed Origin: serve the tool
 *   registry with no bearer token (the frictionless local-developer path). The
 *   tools run under the request's own (unauthenticated) context, so content
 *   reads clamp to what an anonymous visitor may see; the debugging tools this
 *   path exists for read no principal at all.
 * - `"rejected"` — dev, but the request carries a cross-site Origin: block it,
 *   so a web page open in the developer's browser can't reach the endpoint.
 * - `"token"` — dev-trust does not apply (production, or a dev server bound to a
 *   non-loopback interface): authenticate by bearer PAT exactly as in prod.
 */
export type McpDevTrust = "trusted" | "rejected" | "token";

/**
 * Decide whether the frictionless dev-trust path applies to an MCP request.
 *
 * `devCsrfLocalhost` is the dev-server signal (statically false in production
 * builds), so the whole relaxation — and its Origin guard — never runs in prod;
 * the endpoint stays default-off and token-authed there.
 *
 * Two guardrails keep the token-less path safe:
 * - An Origin allowlist (loopback origins plus the configured dev origin). A
 *   non-browser agent sends no Origin and passes; a browser page from any other
 *   site is rejected outright, even over loopback.
 * - A loopback host. The request's Host is the proxy for the bind interface: an
 *   honest client reaching a LAN-exposed dev server targets its LAN host, which
 *   isn't loopback, so the request falls back to token auth. Being a Host-header
 *   check, this is bypassable by a non-browser attacker on the LAN who forges
 *   `Host: localhost` — an accepted dev-only residual. Browsers can't: they send
 *   an honest Host and an Origin the allowlist rejects, and the MCP transport's
 *   content-type forces a CORS preflight Plumix never satisfies.
 */
export function resolveMcpDevTrust(
  ctx: AppContext,
  devCsrfLocalhost: boolean,
): McpDevTrust {
  if (!devCsrfLocalhost) return "token";

  const origin = ctx.request.headers.get("origin");
  if (origin !== null && !isAllowedDevOrigin(origin, ctx.origin)) {
    return "rejected";
  }

  let hostname: string;
  try {
    hostname = new URL(ctx.request.url).hostname;
  } catch {
    return "token";
  }
  return isLoopbackHostname(hostname) ? "trusted" : "token";
}

function isAllowedDevOrigin(origin: string, devOrigin: string): boolean {
  return origin === devOrigin || isLoopbackOrigin(origin);
}
