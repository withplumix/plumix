import type { AppContext } from "../context/app.js";

/**
 * The "current request entity" — populated by the public-route resolver
 * after URL → entity matching. Consumers (breadcrumbs, canonical tags,
 * the menu plugin's `isCurrent` detection) read it via `AppContext` to
 * answer "is this the page we're currently rendering."
 *
 * Archive routes set the `archive` variant carrying the entry type
 * being listed. Single routes set the `entry` variant with the resolved
 * row id. Term-archive routes will set `term` once the route module
 * supports them — the variant is declared now so consumers can branch
 * on it without a future migration.
 */
export type ResolvedEntity =
  | { readonly kind: "entry"; readonly id: number }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "archive"; readonly entryType: string };

/**
 * Discriminated source the menu plugin (and similar consumers) pass when
 * asking "is this thing the current page". Mirrors the menu item's
 * `source` shape but adds a `url` carrier for custom-URL items, which
 * have no upstream id.
 */
export type CurrentSource =
  | { readonly kind: "entry"; readonly id: number }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "custom"; readonly url: string };

/**
 * Returns `true` when `source` identifies the current request entity.
 *
 * - `entry` / `term`: id-based match against `ctx.resolvedEntity`.
 *   Survives URL changes (query strings, trailing slashes) because
 *   the comparison is by id, not by path string. Returns `false` when
 *   `resolvedEntity` is null (non-public route, 404, login page).
 *   Match keys on `(kind, id)` only — relies on `entries.id` /
 *   `terms.id` global uniqueness within their table.
 * - `custom`: pathname-based match against `ctx.request.url`, with
 *   trailing-slash normalization on both sides. Cross-origin sources
 *   never match (an external link is by definition not the current
 *   page). Custom URLs have no id to match against; `resolvedEntity`
 *   is ignored on this path.
 */
export function isCurrentSource(
  ctx: AppContext,
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

  // Cross-origin sources are never the "current page" — an external link
  // is by definition somewhere else, even if its pathname coincides with
  // ours. Compared against the request's host (resolved against the
  // request URL so a relative `/about` sees the same host as `here`).
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
