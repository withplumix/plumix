import type { Segment } from "../access/policy.js";
import type { DeferFn } from "../context/app.js";
import type { TelemetryCollector } from "../context/telemetry.js";
import type { RouteIntent } from "../route/intent.js";
import type { ConnectedCache } from "../runtime/slots.js";
import {
  cacheBypassReason,
  responseIsStorable,
  segmentCacheKey,
} from "./decision.js";

interface ReadThroughArgs {
  readonly request: Request;
  /**
   * The resolved audience segment. It keys the cache entry (so two requests in
   * the same non-`private` segment share one) and decides participation — a
   * `private` segment bypasses the shared cache entirely.
   */
  readonly segment: Segment;
  /**
   * Resolved public route intent, or `null` when the URL matches no public
   * route (a 404) — in which case the cache is never consulted.
   */
  readonly intentKind: RouteIntent["kind"] | null;
  /**
   * When `intentKind` is `"custom"`, whether that plugin-registered archive
   * opted into edge caching. The dispatcher resolves it from the archive-type
   * registry so the pure decision layer stays free of the lookup.
   */
  readonly customArchiveCacheable?: boolean;
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
  const {
    request,
    segment,
    intentKind,
    cache,
    defer,
    telemetry,
    render,
    tags,
  } = args;

  const reason =
    intentKind === null
      ? "no-route"
      : cacheBypassReason({
          method: request.method,
          segment,
          intentKind,
          customArchiveCacheable: args.customArchiveCacheable,
        });
  if (reason !== null) {
    telemetry.record("cache", { decision: "bypass", reason, segment });
    return render();
  }

  // The segment is a cache-key axis: two requests in the same segment collide
  // on one entry, distinct segments never do (#1740).
  const key = segmentCacheKey(request, segment);
  const hit = await cache.match(key);
  if (hit) {
    telemetry.record("cache", { decision: "hit", segment });
    return hit;
  }

  const fresh = await render();
  const stored = responseIsStorable(request.method, fresh.status);
  telemetry.record("cache", { decision: "miss", stored, segment });
  if (stored) {
    defer(cache.put(key, fresh.clone(), tags()));
  }
  return fresh;
}
