import type { AppContext } from "../context/app-context.js";

export type { ResolvedEntity } from "./contract/resolved-entity.js";

/**
 * Mirrors the menu item's `source` shape, plus `custom` for URL items that have
 * no upstream id.
 */
export type CurrentSource =
  | { readonly kind: "entry"; readonly id: number }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "custom"; readonly url: string };

/**
 * Whether `source` is the current request entity. `entry`/`term` match by id,
 * so URL variations don't matter; `custom` matches by pathname, never
 * cross-origin.
 */
export function isCurrentSource(
  ctx: Pick<AppContext, "request" | "resolvedEntity">,
  source: CurrentSource,
): boolean {
  if (source.kind === "custom") {
    return matchesPathname(ctx.request.url, source.url);
  }
  const resolved = ctx.resolvedEntity;
  if (!resolved) return false;
  return resolved.kind === source.kind && resolved.id === source.id;
}

function matchesPathname(requestUrl: string, sourceUrl: string): boolean {
  let here: string;
  let target: URL;
  try {
    here = new URL(requestUrl).pathname;
    target = new URL(sourceUrl, requestUrl);
  } catch {
    return false;
  }

  // An external link is somewhere else even when its pathname coincides with
  // ours.
  const requestHost = new URL(requestUrl).host;
  if (target.host !== requestHost) return false;

  return (
    normalizeTrailingSlash(here) === normalizeTrailingSlash(target.pathname)
  );
}

function normalizeTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}
