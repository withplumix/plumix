import type { AppContext } from "../context/app-context.js";
import { isLoopbackHostname, isLoopbackOrigin } from "../auth/csrf.js";

/**
 * `"trusted"` serves without a token under an anonymous context; `"rejected"`
 * blocks a cross-site Origin; `"token"` requires a bearer token as in prod.
 */
export type McpDevTrust = "trusted" | "rejected" | "token";

/**
 * Statically `"token"` in production builds. A forged `Host: localhost` from a
 * non-browser LAN attacker bypasses the loopback check: an accepted dev-only
 * residual.
 */
export function resolveMcpDevTrust(ctx: AppContext): McpDevTrust {
  if (!process.env.PLUMIX_DEV || ctx.dev === undefined) return "token";

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
