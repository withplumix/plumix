import type { RouteIntent, RouteRule } from "./intent.js";

/**
 * The content route a public request matched: the pattern as it was declared
 * and the params it captured from the path.
 */
export interface ResolvedRoute {
  readonly pattern: string;
  readonly params: Record<string, string>;
}

export interface RouteMatch extends ResolvedRoute {
  readonly intent: RouteIntent;
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
