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

// The markers of an ephemeral, per-request render grant: a `?preview=<token>`
// draft link and a `?plumix.edit` editor session (see `resolveEditMode`).
const PREVIEW_PARAM = "preview";
const EDIT_PARAM = "plumix.edit";

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
  return new URL(request.url).searchParams.has(PREVIEW_PARAM);
}

/**
 * Whether the request carries an *ephemeral, per-request* render grant — a
 * `?preview=<token>` draft link or a `?plumix.edit` editor session — rather than
 * a durable audience membership. Its render is authorized only for this request
 * (a preview token, edit rights) and must never enter the shared cache, even on
 * a policied route whose resolved segment is otherwise cacheable: a stored draft
 * (or an editor's autosave render) would outlive that grant.
 *
 * The un-policied cache path gets this for free through {@link
 * requestIsPrivileged} (whose session-cookie arm bypasses every authenticated
 * request); the policied path keys on the segment — an authenticated audience
 * member always carries a cookie — so it must exclude these grants explicitly.
 * Keyed on the marker's presence, not a validated token: an invalid grant then
 * renders live-but-uncached, which is safe.
 */
export function requestCarriesEphemeralGrant(request: Request): boolean {
  const params = new URL(request.url).searchParams;
  return params.has(PREVIEW_PARAM) || params.has(EDIT_PARAM);
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
 * The cache-key request for a plugin route that opted into the edge cache: its
 * own URL, query string included, with the cookie dropped so every visitor
 * collapses onto one entry. There is no segment axis — the opt-in already
 * claimed one document for everyone.
 */
export function routeCacheKey(request: Request): Request {
  const keyed = new Request(request);
  keyed.headers.delete("cookie");
  return keyed;
}

/**
 * Whether the method may reach the cache at all: a write's response answers
 * that one caller, so it is never a document to share or to serve from a store.
 */
export function methodIsCacheable(method: string): boolean {
  return method === "GET" || method === "HEAD";
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
  if (!methodIsCacheable(req.method)) return "method";
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
 * Whether a response left itself storable in a *shared* cache: `no-store`
 * forbids storing it at all, `private` forbids anyone but its own visitor
 * holding it. Read on the plugin-route path, where the handler's own directive
 * is the one signal core has that a particular response came out personalized
 * — the route may still be worth caching on every other request.
 *
 * The page path deliberately doesn't ask. Core stamps `private, no-store` on a
 * segment variant's client copy precisely so no intermediary reuses it, while
 * the segment-keyed edge copy it stores alongside is shared on purpose.
 */
export function responseAllowsSharedStorage(response: Response): boolean {
  const declared = response.headers.get("cache-control");
  if (declared === null) return true;
  // The directive name is the token before any argument: `private` may carry
  // the field list it covers (`private="set-cookie"`).
  const names = declared
    .split(",")
    .map((directive) => directive.split("=")[0]?.trim().toLowerCase());
  return !names.includes("private") && !names.includes("no-store");
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
