import type { RouteIntent, RouteRule } from "./intent.js";

export interface RouteMatch {
  readonly intent: RouteIntent;
  readonly params: Record<string, string>;
}

export function matchRoute(
  url: URL,
  rules: readonly RouteRule[],
): RouteMatch | null {
  for (const rule of rules) {
    const result = rule.pattern.exec({ pathname: url.pathname });
    if (result === null) continue;
    return { intent: rule.intent, params: extractParams(result.pathname) };
  }
  return null;
}

function extractParams(
  pathname: URLPatternComponentResult,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(pathname.groups)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
