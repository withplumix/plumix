import type { RegisteredPublicRoute } from "../plugin/registry.js";
import { AppBootError } from "../runtime/errors.js";
import { extractParams } from "./match.js";

// The prefix core owns outright: the RPC endpoint, the sign-in flows, the admin
// app, MCP, REST and every `registerRoute` mount live under it, and the
// dispatcher answers there before it ever reaches the public route table. A
// public route registered inside it would therefore be unreachable, so it is
// rejected at boot rather than left to look like a routing bug.
const PLATFORM_PREFIX = "/_plumix";

// URLPattern syntax. A path holding none of it is a literal, which is the
// common case — a plugin enumerates entry types and taxonomies at theme-ready
// and registers concrete paths — so those get a map lookup and never an exec.
const PATTERN_SYNTAX = /[:*?+(){}[\]]/;

interface CompiledPublicRoute {
  readonly route: RegisteredPublicRoute;
  readonly pattern: URLPattern;
}

export interface PublicRouteTable {
  readonly exact: ReadonlyMap<string, RegisteredPublicRoute>;
  readonly patterns: readonly CompiledPublicRoute[];
}

export interface PublicRouteMatch {
  readonly route: RegisteredPublicRoute;
  readonly params: Record<string, string>;
}

/**
 * Compile the registered public routes into the table the dispatcher matches
 * against, rejecting a path two plugins claim, a path inside core's own prefix,
 * and a pattern URLPattern can't parse. Registration is spread across `setup`
 * and the `theme:ready` action, so this runs at boot — the first moment the
 * whole set exists.
 *
 * A claim is the path string: two plugins whose *patterns* merely overlap both
 * compile, and the rules below decide which answers. Nothing here can tell an
 * overlap from a deliberate narrowing, which is why the registration advice is
 * to enumerate concrete paths.
 */
export function compilePublicRoutes(
  routes: readonly RegisteredPublicRoute[],
): PublicRouteTable {
  const exact = new Map<string, RegisteredPublicRoute>();
  const patterns: CompiledPublicRoute[] = [];
  const owners = new Map<string, string>();

  for (const route of routes) {
    if (
      route.path === PLATFORM_PREFIX ||
      route.path.startsWith(`${PLATFORM_PREFIX}/`)
    ) {
      throw AppBootError.publicRouteShadowsCore({
        pluginId: route.pluginId,
        path: route.path,
      });
    }
    const isPattern = PATTERN_SYNTAX.test(route.path);
    // A literal is compared and stored percent-encoded, the shape a request's
    // pathname arrives in — otherwise a route registered as `/café` could never
    // match. A pattern is left alone; URLPattern normalizes it itself.
    const key = isPattern ? route.path : encodedPath(route.path);
    const owner = owners.get(key);
    if (owner !== undefined) {
      throw AppBootError.publicRoutePathConflict({
        pluginId: route.pluginId,
        otherPluginId: owner,
        path: route.path,
      });
    }
    owners.set(key, route.pluginId);
    if (isPattern) {
      patterns.push({ route, pattern: compilePattern(route) });
    } else {
      exact.set(key, route);
    }
  }

  return { exact, patterns };
}

function encodedPath(path: string): string {
  return new URL(path, "https://plumix.invalid").pathname;
}

// URLPattern rejects an unbalanced group with a bare TypeError naming nothing.
// The plugin that registered it is knowable here and nowhere later, so the
// failure is re-thrown as the boot error the other two rejections use.
function compilePattern(route: RegisteredPublicRoute): URLPattern {
  try {
    return new URLPattern({ pathname: route.path });
  } catch (err) {
    throw AppBootError.publicRoutePatternInvalid({
      pluginId: route.pluginId,
      path: route.path,
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * The public route that owns this pathname, or null. A literal path wins over a
 * pattern that would also match it — the more specific claim, and independent
 * of install order; patterns are tried in registration order.
 */
export function matchPublicRoute(
  table: PublicRouteTable,
  pathname: string,
): PublicRouteMatch | null {
  const literal = table.exact.get(pathname);
  if (literal !== undefined) return { route: literal, params: {} };
  for (const { route, pattern } of table.patterns) {
    const result = pattern.exec({ pathname });
    if (result === null) continue;
    return { route, params: extractParams(result.pathname) };
  }
  return null;
}
