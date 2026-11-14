import type { Segment } from "../access/contract/access.js";
import type { RouteIntent } from "../route/contract/intent.js";
import type { ClientCopy } from "./client-copy.js";
import { PRIVATE_SEGMENT } from "../access/contract/segments.js";
import {
  cacheControlAllowsSharedStorage,
  methodIsCacheable,
  routeCdnKey,
  segmentCdnKey,
} from "./decision.js";

/**
 * Public route intents whose anonymous render is a shared, cacheable document.
 * `search` is deliberately excluded — its unbounded query space would pollute
 * the CDN with one entry per distinct query string.
 */
const CACHEABLE_INTENTS: ReadonlySet<RouteIntent["kind"]> = new Set([
  "entry",
  "entryType",
  "term",
  "frontPage",
]);

export type PageKind =
  | {
      readonly kind: "content";
      /** `null` when no public route matched. */
      readonly intent: RouteIntent["kind"] | null;
      /**
       * Core can't know a plugin page's content dependencies, so an archive
       * type or a view caches only on this opt-in.
       */
      readonly registeredCacheable?: boolean;
    }
  /** Renders per reader, so it never reaches the CDN. */
  | { readonly kind: "policied-route" };

export interface RequestFacts {
  readonly request: Request;
  /** Asked through the site's authenticator, never by sniffing the cookie. */
  readonly privileged: boolean;
  /** An API-token request never reads the universal copy. */
  readonly authorization: boolean;
  readonly ephemeralGrant: boolean;
  readonly principalIsPersonal: boolean;
  /** `null` for a page with no access policy. */
  readonly accessSegment: Segment | null;
  readonly page: PageKind;
  /** A vendor varying on a named cookie satisfies it differently. */
  readonly canKeySegments: boolean;
}

/** Why the CDN refused to participate in a request. */
export type CdnBypassReason =
  "method" | "private" | "segment-unsupported" | "intent" | "no-route";

export type SharingDecision =
  | {
      readonly kind: "bypass";
      readonly segment: Segment;
      readonly page: PageKind;
      readonly reason: CdnBypassReason;
    }
  | {
      readonly kind: "read-through";
      readonly segment: Segment;
      readonly page: PageKind;
      readonly key: Request;
      /** The page has no access policy, so its copy is every principal's. */
      readonly universal: boolean;
    }
  /**
   * A signed-in request to a page with no access policy: it may be served the
   * universal anonymous copy, and its own render is never stored.
   */
  | {
      readonly kind: "read-universal";
      readonly segment: Segment;
      readonly page: PageKind;
      readonly key: Request;
    };

export function sharingBeforeRender(facts: RequestFacts): SharingDecision {
  const segment = segmentFor(facts);
  if (readsUniversalCopy(facts)) {
    return {
      kind: "read-universal",
      segment,
      page: facts.page,
      key: segmentCdnKey(facts.request, "anonymous"),
    };
  }
  const reason = bypassReason(facts, segment);
  if (reason !== null) {
    return { kind: "bypass", segment, page: facts.page, reason };
  }
  return {
    kind: "read-through",
    segment,
    page: facts.page,
    key: segmentCdnKey(facts.request, segment),
    universal: segment === "anonymous" && facts.accessSegment === null,
  };
}

/**
 * Only a session reads it: a credential or a grant may change the render, and
 * so may a policy or a principal personal from the start.
 */
function readsUniversalCopy(facts: RequestFacts): boolean {
  if (!facts.privileged || facts.authorization || facts.ephemeralGrant) {
    return false;
  }
  if (facts.accessSegment !== null || facts.principalIsPersonal) return false;
  return bypassReason(facts, "anonymous") === null;
}

/**
 * A per-request grant must not outlive its request in a shared entry, and an
 * `anonymous` render to a privileged request can show who signed in.
 */
function segmentFor(
  facts: Pick<RequestFacts, "privileged" | "ephemeralGrant" | "accessSegment">,
): Segment {
  if (facts.ephemeralGrant) return PRIVATE_SEGMENT;
  const segment = facts.accessSegment ?? "anonymous";
  if (segment === "anonymous" && facts.privileged) return PRIVATE_SEGMENT;
  return segment;
}

function bypassReason(
  facts: RequestFacts,
  segment: Segment,
): CdnBypassReason | null {
  const { page } = facts;
  if (page.kind === "content" && page.intent === null) return "no-route";
  if (!methodIsCacheable(facts.request.method)) return "method";
  if (segment === PRIVATE_SEGMENT) return "private";
  if (segment !== "anonymous" && !facts.canKeySegments) {
    return "segment-unsupported";
  }
  return pageIsCacheable(page) ? null : "intent";
}

function pageIsCacheable(page: PageKind): boolean {
  if (page.kind === "policied-route" || page.intent === null) return false;
  if (page.intent === "archiveType" || page.intent === "view") {
    return page.registeredCacheable === true;
  }
  return CACHEABLE_INTENTS.has(page.intent);
}

export interface RenderFacts {
  readonly status: number;
  readonly personal: boolean;
  readonly setsCookie: boolean;
}

export interface AfterRenderVerdict {
  /** The edge copy is shared; only a GET fills an origin store. */
  readonly store: boolean;
  readonly decorate: boolean;
  readonly universal: boolean;
  readonly clientCopy: ClientCopy;
}

/**
 * Without render facts (a hit, or a route that never reaches the CDN) only the
 * client copy is decided, from the before-render decision alone.
 */
export function sharingAfterRender(
  decision: SharingDecision,
  render?: RenderFacts,
): AfterRenderVerdict {
  const clientCopy = clientCopyFor(decision);
  if (
    decision.kind !== "read-through" ||
    render === undefined ||
    !rendersShareably(render)
  ) {
    return { store: false, decorate: false, universal: false, clientCopy };
  }
  return {
    store: true,
    // The edge copy can drop a visitor's `Set-Cookie`; the client copy can't,
    // so stamping shared freshness beside it would hand that cookie to everyone.
    decorate: clientCopy === "page" && !render.setsCookie,
    universal: decision.universal,
    clientCopy,
  };
}

function rendersShareably(render: RenderFacts): boolean {
  return responseIsShareable(render.status) && !render.personal;
}

/** Gates decoration, so a transient 500 never leaves carrying page freshness. */
export function responseIsShareable(status: number): boolean {
  return status === 200;
}

/**
 * Downstream caches don't know the segment axis, so only the anonymous
 * document may leave shareable, on a hit as on a miss.
 */
function clientCopyFor(decision: SharingDecision): ClientCopy {
  if (decision.kind === "read-universal") return "universal-reader";
  if (decision.segment !== "anonymous") return "private";
  return decision.page.kind === "policied-route" ? "as-rendered" : "page";
}

export interface RouteRequestFacts {
  readonly request: Request;
  /** Asked through the site's authenticator, never by sniffing the cookie. */
  readonly privileged: boolean;
  readonly ephemeralGrant: boolean;
  /**
   * A public route renders a privileged request live as its reader. A raw
   * route still serves it the shared copy but never fills it.
   */
  readonly route: "public" | "raw";
}

/**
 * No segment axis: a route's `cacheable: true` claims every unprivileged
 * visitor gets the same document.
 */
export type RouteSharingDecision =
  | {
      readonly kind: "bypass";
      readonly reason: Extract<CdnBypassReason, "method" | "private">;
    }
  | {
      readonly kind: "read-through";
      readonly key: Request;
      /** Whether this request's own render may fill the shared copy. */
      readonly shareable: boolean;
    };

export function routeSharingBeforeRender(
  facts: RouteRequestFacts,
): RouteSharingDecision {
  const rendersPrivately =
    segmentFor({ ...facts, accessSegment: null }) === PRIVATE_SEGMENT;
  if (rendersPrivately && facts.route === "public") {
    return { kind: "bypass", reason: "private" };
  }
  if (!methodIsCacheable(facts.request.method)) {
    return { kind: "bypass", reason: "method" };
  }
  return {
    kind: "read-through",
    key: routeCdnKey(facts.request),
    shareable: !rendersPrivately,
  };
}

export interface RouteRenderFacts {
  readonly status: number;
  readonly setsCookie: boolean;
  readonly cacheControl: string | null;
}

/**
 * Freshness and tags stay the handler's to declare. `auth: "public"` only means
 * core doesn't gate the route; a handler may still personalize.
 */
export function routeSharingAfterRender(
  decision: RouteSharingDecision,
  render?: RouteRenderFacts,
): AfterRenderVerdict {
  const clientCopy: ClientCopy =
    decision.kind === "bypass" && decision.reason === "private"
      ? "private"
      : "as-rendered";
  if (decision.kind === "bypass" || render === undefined) {
    return { store: false, decorate: false, universal: false, clientCopy };
  }
  // The edge copy is the response the handler built, so it is stored only
  // where it may also leave shared. The store would overwrite
  // `private`/`no-store` with the page TTL.
  const shared =
    decision.shareable &&
    responseIsShareable(render.status) &&
    cacheControlAllowsSharedStorage(render.cacheControl) &&
    !render.setsCookie;
  return { store: shared, decorate: shared, universal: false, clientCopy };
}
