import type { Segment } from "../access/contract/access.js";
import type { DeferFn } from "../context/app-context.js";
import type { TelemetryCollector } from "../context/telemetry.js";
import type { RouteIntent } from "../route/contract/intent.js";
import type { ConnectedCdn } from "../runtime/contract/slots.js";
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
  readonly segment: Segment;
  /** `null` when no public route matched; the CDN is never consulted. */
  readonly intentKind: RouteIntent["kind"] | null;
  /**
   * Resolved by the dispatcher so the pure decision layer stays free of the
   * registry lookup.
   */
  readonly registeredPageCacheable?: boolean;
  readonly cdn: ConnectedCdn;
  readonly defer: DeferFn;
  readonly telemetry: TelemetryCollector;
  readonly render: () => Promise<Response>;
  /** Evaluated after `render`, so it can read the route's resolved entity. */
  readonly tags: () => readonly string[];
  /**
   * A personal render is one member's page: never stored or announced as
   * shared.
   */
  readonly personal: () => boolean;
}

export async function readThrough(args: ReadThroughArgs): Promise<Response> {
  const {
    request,
    segment,
    intentKind,
    cdn,
    defer,
    telemetry,
    render,
    tags,
    personal,
  } = args;

  const originStore = cdn.store !== undefined;
  const reason =
    intentKind === null
      ? "no-route"
      : cdnBypassReason({
          method: request.method,
          segment,
          intentKind,
          registeredPageCacheable: args.registeredPageCacheable,
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

  return lookupOrRender({
    key: segmentCdnKey(request, segment),
    cdn,
    defer,
    telemetry,
    fact: { segment },
    render,
    tags,
    personal,
  });
}

interface ReadThroughRouteArgs {
  readonly request: Request;
  readonly hasSession: boolean;
  readonly cdn: ConnectedCdn;
  readonly defer: DeferFn;
  readonly telemetry: TelemetryCollector;
  readonly render: () => Promise<Response>;
  /**
   * Evaluated after `render`, the only moment the handler has named what it
   * resolved.
   */
  readonly tags: () => readonly string[];
}

/**
 * No segment axis: `cacheable: true` claims every visitor gets the same
 * document, so signed-in visitors share the entry. Freshness and tags stay the
 * handler's to declare.
 */
export async function readThroughRoute(
  args: ReadThroughRouteArgs,
): Promise<Response> {
  const { request, hasSession, cdn, defer, telemetry, render, tags } = args;

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
    shareable: (fresh) => routeResponseIsShareable(request, hasSession, fresh),
    render,
  });
}

// `auth: "public"` only means core doesn't gate the route; a handler checking
// its own bearer token can still return one visitor's response.
function routeResponseIsShareable(
  request: Request,
  hasSession: boolean,
  fresh: Response,
): boolean {
  if (requestIsPrivileged(request, hasSession)) return false;
  if (fresh.headers.has("set-cookie")) return false;
  return responseAllowsSharedStorage(fresh);
}

interface LookupArgs {
  readonly key: Request;
  readonly cdn: ConnectedCdn;
  readonly defer: DeferFn;
  readonly telemetry: TelemetryCollector;
  /**
   * A bag, not a field: the route path has no segment, and `segment: undefined`
   * isn't a `JsonValue`.
   */
  readonly fact: { readonly segment?: Segment };
  readonly render: () => Promise<Response>;
  readonly tags: () => readonly string[];
  readonly shareable?: (fresh: Response) => boolean;
  readonly personal?: () => boolean;
}

async function lookupOrRender(args: LookupArgs): Promise<Response> {
  const { key, cdn, defer, telemetry, fact, render, tags, shareable } = args;
  const store = cdn.store;
  // A storeless deploy misses by definition, so the fact names the regime
  // rather than reading as a failing cache.
  const originStore = store !== undefined;

  const hit = await store?.match(key);
  if (hit) {
    telemetry.record("cdn", { ...fact, decision: "hit", originStore });
    return hit;
  }

  const fresh = await render();
  const personal = args.personal?.() === true;
  const shared =
    responseIsShareable(fresh.status) &&
    !personal &&
    (shareable?.(fresh) ?? true);
  // The Workers Cache API persists GET responses only, so a HEAD render is
  // decorated and served without filling an entry.
  const stored = store !== undefined && shared && key.method === "GET";
  telemetry.record("cdn", {
    ...fact,
    decision: "miss",
    stored,
    originStore,
    ...(personal ? { personal: true } : {}),
  });
  if (!shared) return fresh;

  const entryTags = tags();
  // Cloned before `decorate` reads the body.
  if (stored) defer(store.put(key, fresh.clone(), entryTags));
  // Core refuses a `Set-Cookie` response regardless of whether the provider
  // does.
  if (fresh.headers.has("set-cookie")) return fresh;
  return cdn.decorate(fresh, entryTags);
}
