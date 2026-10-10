import type { Segment } from "../access/contract/access.js";
import type { RouteIntent } from "../route/contract/intent.js";
import { PRIVATE_SEGMENT } from "../access/contract/segments.js";

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

interface CacheableRequest {
  readonly method: string;
  /** Every non-`private` segment is a shared document keyed by the segment. */
  readonly segment: Segment;
  readonly intentKind: RouteIntent["kind"];
  /**
   * Core can't know a plugin page's content dependencies, so it caches only on
   * this opt-in.
   */
  readonly registeredPageCacheable?: boolean;
  /**
   * Named for the capability: a vendor varying on a named cookie satisfies it
   * differently.
   */
  readonly canKeySegments: boolean;
}

/**
 * The markers of an ephemeral, per-request render grant: a `?preview=<token>`
 * draft link and a `?plumix.edit` editor session (see `resolveEditMode`).
 */
const PREVIEW_PARAM = "preview";
const EDIT_PARAM = "plumix.edit";

/**
 * A preview render carries no session yet must never be cached, or it outlives
 * the token. The bearer arm stands alone: the API-token authenticator reports
 * no session.
 */
export function requestIsPrivileged(
  request: Request,
  hasSession: boolean,
): boolean {
  if (hasSession) return true;
  if (request.headers.has("authorization")) return true;
  return new URL(request.url).searchParams.has(PREVIEW_PARAM);
}

/**
 * A per-request grant must never enter the shared CDN, even on a cacheable
 * segment. Keyed on the marker, not a validated token: an invalid grant renders
 * uncached, which is safe.
 */
export function requestCarriesEphemeralGrant(request: Request): boolean {
  const params = new URL(request.url).searchParams;
  return params.has(PREVIEW_PARAM) || params.has(EDIT_PARAM);
}

/** Why the CDN refused to participate in a request. */
export type CdnBypassReason =
  "method" | "private" | "segment-unsupported" | "intent";

/**
 * Stripped from incoming requests before the server-chosen segment is applied,
 * so a crafted query can't poison a variant.
 */
export const SEGMENT_KEY_PARAM = "__plumix_segment";

/**
 * `anonymous` keys under the plain URL. The cookie is dropped so a segment's
 * visitors share one entry; the stored `Vary: Cookie` still protects downstream
 * caches.
 */
export function segmentCdnKey(request: Request, segment: Segment): Request {
  const url = new URL(request.url);
  // The server fully owns this axis — drop any client-supplied marker first.
  url.searchParams.delete(SEGMENT_KEY_PARAM);
  if (segment !== "anonymous") {
    url.searchParams.set(SEGMENT_KEY_PARAM, segment);
  }
  const keyed = new Request(url, request);
  keyed.headers.delete("cookie");
  return keyed;
}

/**
 * The cache-key request for a plugin route that opted into the CDN: its
 * own URL, query string included, with the cookie dropped so every visitor
 * collapses onto one entry.
 */
export function routeCdnKey(request: Request): Request {
  const keyed = new Request(request);
  keyed.headers.delete("cookie");
  return keyed;
}

/** Whether the method may reach the CDN at all. */
export function methodIsCacheable(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/**
 * Gates both reading and storing; returns the first failing check, or `null`.
 */
export function cdnBypassReason(req: CacheableRequest): CdnBypassReason | null {
  if (!methodIsCacheable(req.method)) return "method";
  if (req.segment === PRIVATE_SEGMENT) return "private";
  if (req.segment !== "anonymous" && !req.canKeySegments) {
    return "segment-unsupported";
  }
  // An archive type or a view caches only on its explicit opt-in; the
  // built-in intents are fixed by CACHEABLE_INTENTS.
  const cacheable =
    req.intentKind === "archiveType" || req.intentKind === "view"
      ? req.registeredPageCacheable === true
      : CACHEABLE_INTENTS.has(req.intentKind);
  return cacheable ? null : "intent";
}

/**
 * The page path deliberately doesn't ask: core stamps `private, no-store` on a
 * segment variant's client copy while its segment-keyed edge copy is shared.
 */
export function responseAllowsSharedStorage(response: Response): boolean {
  const declared = response.headers.get("cache-control");
  if (declared === null) return true;
  return !declared.split(",").some((directive) => {
    // The directive name is the token before any argument: `private` may carry
    // the field list it covers (`private="set-cookie"`).
    const name = directive.split("=")[0]?.trim().toLowerCase();
    return name === "private" || name === "no-store";
  });
}

/**
 * Gates decoration, so a transient 500 never leaves carrying page freshness.
 */
export function responseIsShareable(status: number): boolean {
  return status === 200;
}
