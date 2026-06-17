import type { DeferFn } from "../context/app.js";
import type { RouteIntent } from "../route/intent.js";
import type { ConnectedCache } from "../runtime/slots.js";
import {
  requestIsCacheable,
  requestIsPrivileged,
  responseIsStorable,
} from "./decision.js";

interface ReadThroughArgs {
  readonly request: Request;
  /**
   * Resolved public route intent, or `null` when the URL matches no public
   * route (a 404) — in which case the cache is never consulted.
   */
  readonly intentKind: RouteIntent["kind"] | null;
  readonly cache: ConnectedCache;
  readonly defer: DeferFn;
  /** Renders the page live. Called once on a miss, never on a hit. */
  readonly render: () => Promise<Response>;
}

/**
 * Serve a public page through the edge cache: return a stored response on a
 * hit, otherwise render live and store the result when it's cacheable. The
 * store runs through `defer` so it never blocks the response. Requests that
 * aren't cacheable (privileged, non-GET/HEAD, search, no route) render live
 * and touch the cache not at all.
 */
export async function readThrough(args: ReadThroughArgs): Promise<Response> {
  const { request, intentKind, cache, defer, render } = args;

  if (
    intentKind === null ||
    !requestIsCacheable({
      method: request.method,
      isPrivileged: requestIsPrivileged(request),
      intentKind,
    })
  ) {
    return render();
  }

  const hit = await cache.match(request);
  if (hit) return hit;

  const fresh = await render();
  if (responseIsStorable(request.method, fresh.status)) {
    defer(cache.put(request, fresh.clone()));
  }
  return fresh;
}
