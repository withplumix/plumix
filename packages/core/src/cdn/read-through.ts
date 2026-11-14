import type { Segment } from "../access/contract/access.js";
import type { DeferFn } from "../context/app-context.js";
import type { TelemetryCollector } from "../context/telemetry.js";
import type { ConnectedCdn } from "../runtime/contract/slots.js";
import type { SharingDecision } from "./sharing-verdict.js";
import {
  methodIsCacheable,
  requestIsPrivileged,
  responseAllowsSharedStorage,
  routeCdnKey,
} from "./decision.js";
import { responseIsShareable, sharingAfterRender } from "./sharing-verdict.js";
import { isUniversalCopy, markUniversalCopy } from "./universal-copy.js";

export function cdnCanKeySegments(cdn: ConnectedCdn): boolean {
  return cdn.store !== undefined || cdn.segmentVary !== undefined;
}

interface ReadThroughArgs {
  readonly decision: SharingDecision;
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

/** Leaves the client copy to the caller, which applies it on every path. */
export async function readThrough(args: ReadThroughArgs): Promise<Response> {
  const { decision, cdn, defer, telemetry, render, tags, personal } = args;
  const { segment } = decision;

  if (decision.kind === "bypass") {
    telemetry.record("cdn", {
      decision: "bypass",
      reason: decision.reason,
      segment,
      originStore: cdn.store !== undefined,
    });
    return render();
  }

  const readsUniversal = decision.kind === "read-universal";
  return lookupOrRender({
    key: decision.key,
    cdn,
    defer,
    telemetry,
    fact: readsUniversal ? { segment, universalRead: true } : { segment },
    ...(readsUniversal ? { acceptsHit: isUniversalCopy } : {}),
    render,
    tags,
    settle: (fresh) => {
      const isPersonal = personal();
      const verdict = sharingAfterRender(decision, {
        status: fresh.status,
        personal: isPersonal,
      });
      return { ...verdict, personal: isPersonal };
    },
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
 * No segment axis: `cacheable: true` claims every anonymous visitor gets the
 * same document. Freshness and tags stay the handler's to declare.
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
    settle: (fresh) => {
      const shared =
        responseIsShareable(fresh.status) &&
        routeResponseIsShareable(request, hasSession, fresh);
      return {
        store: shared,
        decorate: shared,
        universal: false,
        personal: false,
      };
    },
    render,
  });
}

/**
 * `auth: "public"` only means core doesn't gate the route; a handler may still
 * personalize. The store would strip `Set-Cookie` and overwrite
 * `private`/`no-store` with the page TTL.
 */
function routeResponseIsShareable(
  request: Request,
  hasSession: boolean,
  fresh: Response,
): boolean {
  if (requestIsPrivileged(request, hasSession)) return false;
  if (fresh.headers.has("set-cookie")) return false;
  return responseAllowsSharedStorage(fresh);
}

interface Settled {
  readonly store: boolean;
  readonly decorate: boolean;
  readonly universal: boolean;
  readonly personal: boolean;
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
  readonly fact: {
    readonly segment?: Segment;
    readonly universalRead?: true;
  };
  /**
   * Another copy under the anonymous key may differ by principal, as a
   * policied page's teaser does.
   */
  readonly acceptsHit?: (hit: Response) => boolean;
  readonly render: () => Promise<Response>;
  readonly tags: () => readonly string[];
  readonly settle: (fresh: Response) => Settled;
}

async function lookupOrRender(args: LookupArgs): Promise<Response> {
  const { key, cdn, defer, telemetry, fact, acceptsHit, render, tags, settle } =
    args;
  const store = cdn.store;
  // A storeless deploy misses by definition, so the fact names the regime
  // rather than reading as a failing cache.
  const originStore = store !== undefined;

  const hit = await store?.match(key);
  if (hit && (acceptsHit === undefined || acceptsHit(hit))) {
    telemetry.record("cdn", { ...fact, decision: "hit", originStore });
    return hit;
  }
  await hit?.body?.cancel();

  const fresh = await render();
  const settled = settle(fresh);
  // The Workers Cache API persists GET responses only, so a HEAD render is
  // decorated and served without filling an entry.
  const stored = store !== undefined && settled.store && key.method === "GET";
  telemetry.record("cdn", {
    ...fact,
    decision: "miss",
    stored,
    originStore,
    ...(settled.personal ? { personal: true } : {}),
  });
  if (!settled.store) return fresh;

  const entryTags = tags();
  // Cloned before `decorate` reads the body.
  if (stored) {
    const copy = fresh.clone();
    defer(
      store.put(
        key,
        settled.universal ? markUniversalCopy(copy) : copy,
        entryTags,
      ),
    );
  }
  // Core refuses a `Set-Cookie` response regardless of whether the provider
  // does.
  if (!settled.decorate || fresh.headers.has("set-cookie")) return fresh;
  return cdn.decorate(fresh, entryTags);
}
