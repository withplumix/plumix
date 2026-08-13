import type { Segment } from "../access/policy.js";
import type { RouteIntent } from "../route/intent.js";
import { PRIVATE_SEGMENT } from "../access/policy.js";
import { readSessionCookie } from "../auth/cookies.js";

// Public route intents whose anonymous render is a shared, cacheable document.
// `search` is deliberately excluded — its unbounded query space would pollute
// the cache with one entry per distinct query string.
const CACHEABLE_INTENTS: ReadonlySet<RouteIntent["kind"]> = new Set([
  "single",
  "archive",
  "taxonomy",
  "front-page",
]);

interface CacheableRequest {
  readonly method: string;
  /**
   * The resolved audience segment this render belongs to. Every non-`private`
   * segment is a shared, cacheable document keyed by the segment; `private` is
   * the escape hatch whose render is per-visitor and never touches the shared
   * cache. The un-policied default maps a privileged request to `private` and
   * an anonymous one to `anonymous`, preserving today's behavior exactly.
   */
  readonly segment: Segment;
  readonly intentKind: RouteIntent["kind"];
  /**
   * For a `custom` (plugin-registered) archive, whether it opted into edge
   * caching via `registerArchiveType({ cacheable: true })`. Core can't know a
   * custom archive's content dependencies, so it caches only on this opt-in.
   * Ignored for the built-in intents, whose cacheability is fixed by
   * {@link CACHEABLE_INTENTS}.
   */
  readonly customArchiveCacheable?: boolean;
}

/**
 * Whether a request carries elevated visibility: an authenticated session or
 * bearer credential, or a `?preview=<token>` draft grant. Any of these can
 * make the render differ from the shared anonymous document — a logged-in
 * editor's view, or a draft visible only to a preview-link holder — so such
 * requests must bypass the cache entirely. The preview case is the load-bearing
 * one: a draft render is anonymous (no cookie) yet must never be cached, or it
 * would outlive the token's authorization window in the edge cache.
 */
export function requestIsPrivileged(request: Request): boolean {
  if (readSessionCookie(request) !== null) return true;
  if (request.headers.has("authorization")) return true;
  return new URL(request.url).searchParams.has("preview");
}

/** Why the edge cache refused to participate in a request. */
export type CacheBypassReason = "method" | "private" | "intent";

/**
 * The variant marker folded into a cache-key URL for a non-anonymous segment.
 * Framework-reserved (the `__plumix_` namespace) so it can't collide with a
 * real query parameter; stripped from any incoming request before the
 * server-chosen segment is applied, so a crafted query can't poison a variant.
 */
export const SEGMENT_KEY_PARAM = "__plumix_segment";

/**
 * The cache-key request for a render in `segment`. The edge cache backs onto
 * the request URL, so a distinct segment must produce a distinct key: the
 * `anonymous` segment keys under the plain URL (un-policied pages, and an
 * explicit `anonymous` grant, share exactly today's entry), and every other
 * segment folds its label into the URL as a reserved query parameter.
 *
 * The Cookie header is stripped from the key so that two visitors in the same
 * segment collapse onto one entry even though their session cookies differ,
 * while the stored response's `Vary: Cookie` still keeps a downstream shared
 * cache from serving one visitor's variant to another.
 */
export function segmentCacheKey(request: Request, segment: Segment): Request {
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
 * The gate for whether the edge cache may participate in this request at all —
 * both reading a stored response and storing a fresh one. Returns `null` when
 * the request is cacheable, otherwise the first failing check — the reason the
 * telemetry `cache` record carries.
 */
export function cacheBypassReason(
  req: CacheableRequest,
): CacheBypassReason | null {
  if (req.method !== "GET" && req.method !== "HEAD") return "method";
  if (req.segment === PRIVATE_SEGMENT) return "private";
  // A custom archive caches only on its explicit opt-in; the built-in intents
  // are fixed by CACHEABLE_INTENTS.
  const cacheable =
    req.intentKind === "custom"
      ? req.customArchiveCacheable === true
      : CACHEABLE_INTENTS.has(req.intentKind);
  return cacheable ? null : "intent";
}

/**
 * Whether a rendered response may be written to the edge cache. Only a `200`
 * is a complete public document worth storing; redirects and errors are never
 * cached. Restricted to `GET` because the Workers Cache API persists GET
 * responses only — a HEAD render is served live.
 */
export function responseIsStorable(method: string, status: number): boolean {
  return method === "GET" && status === 200;
}
