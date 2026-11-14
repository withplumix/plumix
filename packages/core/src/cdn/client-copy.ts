import type { Segment } from "../access/contract/access.js";
import { withHeaders } from "../runtime/contract/http.js";

/**
 * Downstream caches don't know the segment axis, so only the anonymous
 * document may leave shareable, on a hit as on a miss: the edge copy is widened
 * for storage only.
 */
export function segmentClientCopy(
  response: Response,
  segment: Segment,
): Response {
  if (segment === "anonymous") return response;
  return withHeaders(response, (headers) => {
    headers.set("cache-control", "private, no-store");
    if (!variesOnCookie(headers)) headers.append("vary", "cookie");
    headers.delete("cache-tag");
  });
}

/**
 * A shared cache in front would keep an undeclared page under its own
 * defaults, with no tag a publish could purge. A declared `Cache-Control` is
 * kept.
 */
export function pageClientCopy(response: Response): Response {
  if (response.headers.has("cache-control")) return response;
  return withHeaders(response, (headers) => {
    headers.set("cache-control", "private, no-cache");
  });
}

function variesOnCookie(headers: Headers): boolean {
  const vary = headers.get("vary");
  if (vary === null) return false;
  return vary
    .split(",")
    .some((field) => field.trim().toLowerCase() === "cookie");
}
