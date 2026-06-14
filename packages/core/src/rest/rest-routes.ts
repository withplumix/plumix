// Pure route-overlap helpers — no oRPC imports, so the boot-time collision
// check (buildApp) can use them without pulling the REST handler graph onto the
// cold-start path.

export interface RestRoute {
  readonly method: string;
  readonly path: string;
}

function isParam(segment: string): boolean {
  return segment.startsWith("{") && segment.endsWith("}");
}

/**
 * Two routes overlap when some URL would match both: same method, same segment
 * count, and every position is either an exact literal match or a `{param}` on
 * either side. The matcher ranks static segments above params, so a literal
 * plugin path inside core's `/{collection}` space would silently shadow it —
 * overlap (not string equality) is what makes "core paths reserved" real.
 */
export function routesOverlap(a: RestRoute, b: RestRoute): boolean {
  if (a.method !== b.method) return false;
  const aSegments = a.path.split("/");
  const bSegments = b.path.split("/");
  if (aSegments.length !== bSegments.length) return false;
  return aSegments.every((segment, i) => {
    const other = bSegments[i] ?? "";
    return segment === other || isParam(segment) || isParam(other);
  });
}

// Core's reserved routes. Core owns the entire 1- and 2-segment collection
// space, so plugin resources must nest deeper (e.g. `/{type}/{id}/comments`).
export const CORE_REST_ROUTES: readonly RestRoute[] = [
  { method: "GET", path: "/{collection}" },
  { method: "GET", path: "/{collection}/{id}" },
];
