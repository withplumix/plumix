import { extractParams } from "./params.js";

/**
 * Generic over the route: the registered route names the plugin registry,
 * which already imports route's contract, so naming it here would make a
 * cycle (ADR 0010). `route/public-routes.ts` instantiates it.
 */
export interface CompiledPublicRouteFor<TRoute> {
  readonly route: TRoute;
  readonly pattern: URLPattern;
}

export interface PublicRouteTableFor<TRoute> {
  readonly exact: ReadonlyMap<string, TRoute>;
  readonly patterns: readonly CompiledPublicRouteFor<TRoute>[];
}

export interface PublicRouteMatchFor<TRoute> {
  readonly route: TRoute;
  readonly params: Record<string, string>;
}

/**
 * The public route that owns this pathname, or null. A literal path beats a
 * matching pattern regardless of install order; patterns are tried in
 * registration order.
 */
export function matchPublicRoute<TRoute>(
  table: PublicRouteTableFor<TRoute>,
  pathname: string,
): PublicRouteMatchFor<TRoute> | null {
  const literal = table.exact.get(pathname);
  if (literal !== undefined) return { route: literal, params: {} };
  for (const { route, pattern } of table.patterns) {
    const result = pattern.exec({ pathname });
    if (result === null) continue;
    return { route, params: extractParams(result.pathname) };
  }
  return null;
}
