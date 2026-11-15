import { ADMIN_BASE_PATH } from "../src/lib/constants.js";
import { ROUTE_ALIASES } from "../src/lib/route-aliases.js";

export interface Redirect {
  readonly from: string;
  readonly to: string;
}

/** The route `url` shows, relative to the admin's base, without its query. */
function routeOf(url: string): string {
  const route = new URL(url).pathname.slice(ADMIN_BASE_PATH.length);
  return route === "" ? "/" : route;
}

function isAlias(route: string): route is keyof typeof ROUTE_ALIASES {
  return Object.hasOwn(ROUTE_ALIASES, route);
}

/** A `$param` segment of `pattern` matches any one segment of `route`. */
function matchesPattern(route: string, pattern: string): boolean {
  const segments = route.split("/");
  const patternSegments = pattern.split("/");
  return (
    segments.length === patternSegments.length &&
    patternSegments.every(
      (segment, index) =>
        segment.startsWith("$") || segment === segments[index],
    )
  );
}

/** True when a page opened at `expected` shows `route`, itself or as its alias's target. */
export function servesRoute(route: string, expected: string): boolean {
  if (route === expected) return true;
  return isAlias(expected) && matchesPattern(route, ROUTE_ALIASES[expected]);
}

/** Where the browser ended up, when a page opened at `route` sent it elsewhere. */
export function redirectOf(
  route: string,
  finalUrl: string,
): Redirect | undefined {
  const to = routeOf(finalUrl);
  if (servesRoute(to, route)) return undefined;
  return { from: route, to };
}
