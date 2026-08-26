import type { Segment } from "../access/policy.js";
import type { DeferFn } from "../context/app.js";
import type { TelemetryCollector } from "../context/telemetry.js";
import type { RouteIntent } from "../route/intent.js";
import type { ConnectedCache } from "../runtime/slots.js";
import {
  cacheBypassReason,
  methodIsCacheable,
  responseAllowsSharedStorage,
  responseIsStorable,
  routeCacheKey,
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
  return lookupOrRender({
    key: segmentCacheKey(request, segment),
    cache,
    defer,
    telemetry,
    fact: { segment },
    render,
    tags,
  });
}

interface RouteReadThroughArgs {
  readonly request: Request;
  readonly cache: ConnectedCache;
  readonly defer: DeferFn;
  readonly telemetry: TelemetryCollector;
  /** Runs the plugin's handler. Called once on a miss, never on a hit. */
  readonly render: () => Promise<Response>;
}

/**
 * Serve a plugin-registered raw route through the edge cache — the read-through
 * a route opts into with `registerRoute({ cacheable: true })`.
 *
 * There is no segment axis here. The opt-in is the plugin's claim that the
 * route answers every visitor with the same document, so the entry is keyed off
 * the URL with the cookie dropped and a signed-in visitor shares it rather than
 * bypassing it. Freshness stays the handler's to declare: the provider keeps a
 * `cache-control` it set and falls back to the site's page TTL only when it set
 * none, and a response that declared itself unshareable is not stored at all.
 *
 * Nothing tags the entry — core can't name what a raw route's response depends
 * on — so what expires it is that freshness, never a purge.
 */
export async function readThroughRoute(
  args: RouteReadThroughArgs,
): Promise<Response> {
  const { request, cache, defer, telemetry, render } = args;

  if (!methodIsCacheable(request.method)) {
    telemetry.record("cache", { decision: "bypass", reason: "method" });
    return render();
  }

  return lookupOrRender({
    key: routeCacheKey(request),
    cache,
    defer,
    telemetry,
    fact: {},
    tags: () => [],
    // The opt-in speaks for the route; this response speaks for itself.
    storable: responseAllowsSharedStorage,
    render,
  });
}

interface LookupArgs {
  /** The cache-key request — the axes that separate entries are folded in. */
  readonly key: Request;
  readonly cache: ConnectedCache;
  readonly defer: DeferFn;
  readonly telemetry: TelemetryCollector;
  /** Fields stamped on every `cache` record this lookup emits. */
  readonly fact: { readonly segment?: Segment };
  readonly render: () => Promise<Response>;
  readonly tags: () => readonly string[];
  /**
   * A condition on the fresh response beyond its method and status. Only the
   * route path sets one; a page render is storable on those two alone.
   */
  readonly storable?: (fresh: Response) => boolean;
}

// Shared by both read-throughs, once their own bypass rules have passed. The
// store runs through `defer` so it never blocks the response.
async function lookupOrRender(args: LookupArgs): Promise<Response> {
  const { key, cache, defer, telemetry, fact, render, tags, storable } = args;

  const hit = await cache.match(key);
  if (hit) {
    telemetry.record("cache", { ...fact, decision: "hit" });
    return hit;
  }

  const fresh = await render();
  const stored =
    responseIsStorable(key.method, fresh.status) && (storable?.(fresh) ?? true);
  telemetry.record("cache", { ...fact, decision: "miss", stored });
  if (stored) {
    defer(cache.put(key, fresh.clone(), tags()));
  }
  return fresh;
}
