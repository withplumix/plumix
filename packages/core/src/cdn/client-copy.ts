import { withHeaders } from "../runtime/contract/http.js";
import {
  isUniversalCopy,
  UNIVERSAL_COPY_HEADER,
  withoutUniversalMarker,
} from "./universal-copy.js";

export type ClientCopy =
  "private" | "page" | "as-rendered" | "universal-reader";

export function applyClientCopy(
  response: Response,
  copy: ClientCopy,
): Response {
  switch (copy) {
    case "private":
      return privateClientCopy(response);
    case "page":
      return pageClientCopy(response);
    case "as-rendered":
      return response;
    case "universal-reader":
      return universalReaderCopy(response);
  }
}

/**
 * The universal copy is no reader's own, so their browser may keep it while it
 * revalidates.
 */
function universalReaderCopy(response: Response): Response {
  if (!isUniversalCopy(response)) return privateClientCopy(response);
  return withHeaders(response, (headers) => {
    headers.delete(UNIVERSAL_COPY_HEADER);
    headers.set("cache-control", "private, no-cache");
    if (!variesOnCookie(headers)) headers.append("vary", "cookie");
    headers.delete("cache-tag");
  });
}

/** The edge copy is widened for storage only; this copy is one reader's. */
export function privateClientCopy(response: Response): Response {
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
  const page = withoutUniversalMarker(response);
  if (page.headers.has("cache-control")) return page;
  return withHeaders(page, (headers) => {
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
