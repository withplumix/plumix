import { OAUTH_PROVIDER_KEY_PATTERN } from "./types.js";

interface OAuthRouteParams {
  readonly providerKey: string;
}

/**
 * Match `/_plumix/auth/oauth/<key>/(start|callback)`. The shape check
 * (alphanum + `_-`) happens here; existence check ("is this a configured
 * provider?") happens in the handler. A path that doesn't match the
 * shape returns null → 404 from the dispatcher.
 *
 * Kept apart from the OAuth handlers so the dispatcher can match the path
 * eagerly without pulling the (heavy) consumer/arctic graph onto the
 * public render cold-start path; the handlers load on first OAuth request.
 */
export function parseOAuthPath(
  pathname: string,
): { params: OAuthRouteParams; tail: "start" | "callback" } | null {
  const prefix = "/_plumix/auth/oauth/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const providerKey = rest.slice(0, slash);
  const tail = rest.slice(slash + 1);
  if (!OAUTH_PROVIDER_KEY_PATTERN.test(providerKey)) return null;
  if (tail !== "start" && tail !== "callback") return null;
  return { params: { providerKey }, tail };
}
