import type { DeferFn } from "../context/app.js";
import type { TelemetryCollector } from "../context/telemetry.js";
import type { RouteIntent } from "../route/intent.js";
import type { ConnectedCache } from "../runtime/slots.js";
import {
  cacheBypassReason,
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
  /** Records the cache decision + reason as a durationless `cache` fact. */
  readonly telemetry: TelemetryCollector;
  /** Renders the page live. Called once on a miss, never on a hit. */
  readonly render: () => Promise<Response>;
  /**
   * The cache tags the stored response should carry. Evaluated after `render`
   * so it can read the route's resolved entity (e.g. the entry id).
   */
  readonly tags: () => readonly string[];
}

/**
 * Serve a public page through the edge cache: return a stored response on a
 * hit, otherwise render live and store the result when it's cacheable. The
 * store runs through `defer` so it never blocks the response. Requests that
 * aren't cacheable (privileged, non-GET/HEAD, search, no route) render live
 * and touch the cache not at all.
 */
export async function readThrough(args: ReadThroughArgs): Promise<Response> {
  const { request, intentKind, cache, defer, telemetry, render, tags } = args;

  const reason =
    intentKind === null
      ? "no-route"
      : cacheBypassReason({
          method: request.method,
          isPrivileged: requestIsPrivileged(request),
          intentKind,
        });
  if (reason !== null) {
    telemetry.record("cache", { decision: "bypass", reason });
    return render();
  }

  const hit = await cache.match(request);
  if (hit) {
    telemetry.record("cache", { decision: "hit" });
    return hit;
  }

  const fresh = await render();
  const stored = responseIsStorable(request.method, fresh.status);
  telemetry.record("cache", { decision: "miss", stored });
  if (stored) {
    defer(cache.put(request, fresh.clone(), tags()));
  }
  return fresh;
}
