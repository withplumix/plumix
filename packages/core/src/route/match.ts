import type { RouteIntent, RouteRule } from "./intent.js";

/**
 * The content route a public request matched: the pattern as it was declared,
 * the params it captured from the path, and what the route is — so a reader
 * of the request (a head filter naming the page's archive) has the router's
 * answer rather than matching the path again.
 */
export interface ResolvedRoute {
  readonly pattern: string;
  readonly params: Record<string, string>;
  readonly intent: RouteIntent;
}

export type RouteMatch = ResolvedRoute;

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
