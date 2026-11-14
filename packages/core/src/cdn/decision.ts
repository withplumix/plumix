import type { Segment } from "../access/contract/access.js";

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

/**
 * Stripped from incoming requests before the server-chosen segment is applied,
 * so a crafted query can't poison a variant.
 */
export const SEGMENT_KEY_PARAM = "__plumix_segment";

/**
 * The build that rendered a stored page; a deploy never reads another build's
 * entry, whose asset URLs it no longer serves.
 */
export const BUILD_KEY_PARAM = "__plumix_build";

function setBuildAxis(url: URL): void {
  // A crafted `?__plumix_build=` must not select another build's entry.
  url.searchParams.delete(BUILD_KEY_PARAM);
  // Vite-substituted, so a Worker with an empty `process.env` still gets it.
  const build = process.env.PLUMIX_BUILD_ID;
  if (build) url.searchParams.set(BUILD_KEY_PARAM, build);
}

/**
 * `anonymous` keys under the plain URL. The cookie is dropped so a segment's
 * visitors share one entry.
 */
export function segmentCdnKey(request: Request, segment: Segment): Request {
  const url = new URL(request.url);
  // The server fully owns this axis — drop any client-supplied marker first.
  url.searchParams.delete(SEGMENT_KEY_PARAM);
  if (segment !== "anonymous") {
    url.searchParams.set(SEGMENT_KEY_PARAM, segment);
  }
  setBuildAxis(url);
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
  const url = new URL(request.url);
  setBuildAxis(url);
  const keyed = new Request(url, request);
  keyed.headers.delete("cookie");
  return keyed;
}

/** Whether the method may reach the CDN at all. */
export function methodIsCacheable(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/**
 * The page path deliberately doesn't ask: core stamps `private, no-store` on a
 * segment variant's client copy while its segment-keyed edge copy is shared.
 */
export function responseAllowsSharedStorage(response: Response): boolean {
  return cacheControlAllowsSharedStorage(response.headers.get("cache-control"));
}

export function cacheControlAllowsSharedStorage(
  declared: string | null,
): boolean {
  if (declared === null) return true;
  return !declared.split(",").some((directive) => {
    // The directive name is the token before any argument: `private` may carry
    // the field list it covers (`private="set-cookie"`).
    const name = directive.split("=")[0]?.trim().toLowerCase();
    return name === "private" || name === "no-store";
  });
}
