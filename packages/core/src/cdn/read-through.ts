import type { Segment } from "../access/policy.js";
import type { DeferFn } from "../context/app.js";
import type { TelemetryCollector } from "../context/telemetry.js";
import type { RouteIntent } from "../route/intent.js";
import type { ConnectedCdn } from "../runtime/slots.js";
import {
  cdnBypassReason,
  methodIsCacheable,
  requestIsPrivileged,
  responseAllowsSharedStorage,
  responseIsShareable,
  routeCdnKey,
  segmentCdnKey,
} from "./decision.js";

interface ReadThroughArgs {
  readonly request: Request;
  /**
   * The resolved audience segment. It keys the cache entry (so two requests in
   * the same non-`private` segment share one) and decides participation — a
   * `private` segment bypasses the shared CDN entirely.
   */
  readonly segment: Segment;
  /**
   * Resolved public route intent, or `null` when the URL matches no public
   * route (a 404) — in which case the CDN is never consulted.
   */
  readonly intentKind: RouteIntent["kind"] | null;
  /**
   * When `intentKind` is `"custom"`, whether that plugin-registered archive
   * opted into CDN caching. The dispatcher resolves it from the archive-type
   * registry so the pure decision layer stays free of the lookup.
   */
  readonly customArchiveCacheable?: boolean;
  readonly cdn: ConnectedCdn;
  readonly defer: DeferFn;
  /** Records the cache decision + reason as a durationless `cdn` fact. */
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
 * Serve a public page through the CDN: return a stored response on a hit,
 * otherwise render live and hand the result to the provider on the way out —
 * decorated with the site's freshness and the page's cache tags, and written to
 * an origin store where the provider has one. The store runs through `defer` so
 * it never blocks the response. Requests that aren't cacheable (privileged,
 * non-GET/HEAD, search, no route) render live and touch the CDN not at all.
 */
export async function readThrough(args: ReadThroughArgs): Promise<Response> {
  const { request, segment, intentKind, cdn, defer, telemetry, render, tags } =
    args;

  const originStore = cdn.store !== undefined;
  const reason =
    intentKind === null
      ? "no-route"
      : cdnBypassReason({
          method: request.method,
          segment,
          intentKind,
          customArchiveCacheable: args.customArchiveCacheable,
          canKeySegments: originStore || cdn.segmentVary !== undefined,
        });
  if (reason !== null) {
    telemetry.record("cdn", {
      decision: "bypass",
      reason,
      segment,
      originStore,
    });
    return render();
  }

  // The segment is a cache-key axis: two requests in the same segment collide
  // on one entry, distinct segments never do (#1740).
  return lookupOrRender({
    key: segmentCdnKey(request, segment),
    cdn,
    defer,
    telemetry,
    fact: { segment },
    render,
    tags,
  });
}

interface ReadThroughRouteArgs {
  readonly request: Request;
  readonly cdn: ConnectedCdn;
  readonly defer: DeferFn;
  readonly telemetry: TelemetryCollector;
  /** Runs the plugin's handler. Called once on a miss, never on a hit. */
  readonly render: () => Promise<Response>;
  /**
   * The tags the stored response should carry. Evaluated after `render`,
   * which is the only moment the handler has named what it resolved.
   */
  readonly tags: () => readonly string[];
}

/**
 * Serve a plugin-registered raw route through the CDN — the read-through
 * a route opts into with `registerRoute({ cacheable: true })`.
 *
 * There is no segment axis here. The opt-in is the plugin's claim that the
 * route answers every visitor with the same document, so the entry is keyed off
 * the URL with the cookie dropped and a signed-in visitor shares it rather than
 * bypassing it. Freshness stays the handler's to declare: the provider keeps a
 * `cache-control` it set and falls back to the site's page TTL only when it set
 * none. Tags are the handler's too — core can't name what a raw route's
 * response depends on, but the handler can, through `tagCdnEntry` — and a
 * handler that names none stores an entry no purge reaches.
 */
export async function readThroughRoute(
  args: ReadThroughRouteArgs,
): Promise<Response> {
  const { request, cdn, defer, telemetry, render, tags } = args;

  if (!methodIsCacheable(request.method)) {
    telemetry.record("cdn", {
      decision: "bypass",
      reason: "method",
      originStore: cdn.store !== undefined,
    });
    return render();
  }

  return lookupOrRender({
    key: routeCdnKey(request),
    cdn,
    defer,
    telemetry,
    fact: {},
    tags,
    shareable: (fresh) => routeResponseIsShareable(request, fresh),
    render,
  });
}

// The opt-in speaks for the route; each response still speaks for itself, and
// the entry it would fill is reachable only by whatever tags the handler
// declared — often none. So a response that came out for one visitor is neither
// stored nor announced as shared: `auth: "public"` only means *core* doesn't
// gate the route, and a handler checking a bearer token core knows nothing
// about is exactly the shape at risk. A `Set-Cookie` says the same thing (the
// store would strip it, leaving later visitors a body whose cookie went
// missing), as does a `private`/`no-store` the store would otherwise overwrite
// with the page TTL.
function routeResponseIsShareable(request: Request, fresh: Response): boolean {
  if (requestIsPrivileged(request)) return false;
  if (fresh.headers.has("set-cookie")) return false;
  return responseAllowsSharedStorage(fresh);
}

interface LookupArgs {
  /** The cache-key request — the axes that separate entries are folded in. */
  readonly key: Request;
  readonly cdn: ConnectedCdn;
  readonly defer: DeferFn;
  readonly telemetry: TelemetryCollector;
  /**
   * Spread into every `cdn` record this lookup emits. A bag rather than a
   * field because the route path has no segment at all, and a `segment:
   * undefined` key is not a `JsonValue`.
   */
  readonly fact: { readonly segment?: Segment };
  readonly render: () => Promise<Response>;
  readonly tags: () => readonly string[];
  /**
   * A condition on the fresh response beyond its status. Only the route path
   * sets one; a page render is shareable on its status alone.
   */
  readonly shareable?: (fresh: Response) => boolean;
}

// Shared by both read-throughs, once their own bypass rules have passed. The
// store runs through `defer` so it never blocks the response.
async function lookupOrRender(args: LookupArgs): Promise<Response> {
  const { key, cdn, defer, telemetry, fact, render, tags, shareable } = args;
  const store = cdn.store;
  // A storeless deploy never hits at the origin — every arriving request got
  // past the CDN and is a miss by definition — so the fact says which regime
  // produced it rather than reading as a permanently failing cache.
  const originStore = store !== undefined;

  const hit = await store?.match(key);
  if (hit) {
    telemetry.record("cdn", { ...fact, decision: "hit", originStore });
    return hit;
  }

  const fresh = await render();
  const shared =
    responseIsShareable(fresh.status) && (shareable?.(fresh) ?? true);
  // The Workers Cache API persists GET responses only, so a HEAD render is
  // decorated and served without filling an entry.
  const stored = store !== undefined && shared && key.method === "GET";
  telemetry.record("cdn", { ...fact, decision: "miss", stored, originStore });
  if (!shared) return fresh;

  const entryTags = tags();
  // Cloned before `decorate` reads the body.
  if (stored) defer(store.put(key, fresh.clone(), entryTags));
  // A per-visitor cookie can be stripped from the store's own copy but not
  // from the one going back to the visitor, so that response leaves
  // unannounced rather than inviting a shared cache to hold it. The port asks
  // every provider for the same refusal; core makes it regardless.
  if (fresh.headers.has("set-cookie")) return fresh;
  return cdn.decorate(fresh, entryTags);
}
