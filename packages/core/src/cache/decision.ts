import type { RouteIntent } from "../route/intent.js";
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
   * True when the request may see content the anonymous public can't — so its
   * render must never be read from or written to the shared cache.
   */
  readonly isPrivileged: boolean;
  readonly intentKind: RouteIntent["kind"];
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

/**
 * Whether the edge cache may participate in this request at all — the gate for
 * both reading a stored response and storing a fresh one.
 */
export function requestIsCacheable(req: CacheableRequest): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (req.isPrivileged) return false;
  return CACHEABLE_INTENTS.has(req.intentKind);
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
