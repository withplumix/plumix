import { OAUTH_PROVIDER_KEY_PATTERN } from "../contract/oauth.js";

interface OAuthRouteParams {
  readonly providerKey: string;
}

/**
 * Checks shape only, not whether the provider is configured. Kept apart from
 * the handlers so matching doesn't load the heavy OAuth graph on cold start.
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
