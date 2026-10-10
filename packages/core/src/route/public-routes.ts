import type { PluginRegistry } from "../plugin/manifest.js";
import type { RegisteredPublicRoute } from "../plugin/registry.js";
import type {
  CompiledPublicRouteFor,
  PublicRouteMatchFor,
  PublicRouteTableFor,
} from "./contract/public-route-table.js";
import { AppBootError } from "../runtime/contract/errors.js";
import { matchPublicRoute } from "./contract/public-route-table.js";

// The dispatcher answers under this prefix before the public route table, so a
// route registered inside it is unreachable and rejected at boot.
const PLATFORM_PREFIX = "/_plumix";

// A path without URLPattern syntax is a literal, the common case, and gets a
// map lookup instead of an exec.
const PATTERN_SYNTAX = /[:*?+(){}[\]]/;

export type PublicRouteTable = PublicRouteTableFor<RegisteredPublicRoute>;

export type PublicRouteMatch = PublicRouteMatchFor<RegisteredPublicRoute>;

/**
 * Compile the registered public routes, rejecting a path two plugins claim, one
 * inside core's prefix, or an unparseable pattern. Merely overlapping patterns
 * both compile.
 */
export function compilePublicRoutes(
  routes: readonly RegisteredPublicRoute[],
): PublicRouteTable {
  const exact = new Map<string, RegisteredPublicRoute>();
  const patterns: CompiledPublicRouteFor<RegisteredPublicRoute>[] = [];
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
    // Literals are keyed percent-encoded, as request pathnames arrive, so
    // `/café` can match; URLPattern normalizes patterns itself.
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

// URLPattern's TypeError names nothing; only here is the registering plugin
// known, so rethrow as a boot error.
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

// Compiled once per registry: the routes are settled once every `afterSetup`
// has run, which is before anything asks.
const registryTables = new WeakMap<PluginRegistry, PublicRouteTable>();

/**
 * The public route the dispatcher answers this pathname (no base path) with, or
 * null, using the dispatcher's own table and rules.
 */
export function publicRouteAt(
  plugins: PluginRegistry,
  pathname: string,
): PublicRouteMatch | null {
  let table = registryTables.get(plugins);
  if (table === undefined) {
    table = compilePublicRoutes(plugins.publicRoutes);
    registryTables.set(plugins, table);
  }
  return matchPublicRoute(table, pathname);
}
