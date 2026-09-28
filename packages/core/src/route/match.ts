import type { RouteRule } from "./contract/intent.js";
import type { ResolvedRoute } from "./contract/resolved-route.js";

export type { ResolvedRoute } from "./contract/resolved-route.js";

/** The route as the resolver reads it: whether core owns the URL's canonical form. */
export interface RouteMatch extends ResolvedRoute {
  readonly isPermalinkRoute: boolean;
}

export function matchRoute(
  url: URL,
  rules: readonly RouteRule[],
): RouteMatch | null {
  for (const rule of rules) {
    const result = rule.pattern.exec({ pathname: url.pathname });
    if (result === null) continue;
    return {
      intent: rule.intent,
      pattern: rule.rawPattern,
      params: extractParams(result.pathname),
      isPermalinkRoute: rule.isPermalinkRoute,
    };
  }
  return null;
}

export function extractParams(
  pathname: URLPatternComponentResult,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(pathname.groups)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
