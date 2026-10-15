import { ADMIN_BASE_PATH } from "./constants.js";

/** Split a search group key into its domain and remainder (`entry:post`
 *  → `{ domain: "entry", name: "post" }`; `users` → `{ "users", "" }`). */
function parseGroupKey(groupKey: string): {
  readonly domain: string;
  readonly name: string;
} {
  const sep = groupKey.indexOf(":");
  return sep === -1
    ? { domain: groupKey, name: "" }
    : { domain: groupKey.slice(0, sep), name: groupKey.slice(sep + 1) };
}

/** A shorter query searches nothing on the server. */
export const MIN_QUERY_LENGTH = 2;

/**
 * True while a search-length query is debouncing or in flight, so "no
 * results" doesn't flash before the first response lands.
 */
export function isPaletteSearching(
  trimmed: string,
  debounced: string,
  isFetching: boolean,
): boolean {
  return (
    trimmed.length >= MIN_QUERY_LENGTH && (trimmed !== debounced || isFetching)
  );
}

/**
 * The in-app route of a result's editor, encoded the way the router encodes a
 * segment. `null` for an unroutable domain.
 */
export function resultRoute(
  groupKey: string,
  id: string,
  slugOf: (name: string) => string,
): string | null {
  const { domain, name } = parseGroupKey(groupKey);
  const eid = encodeURIComponent(id);
  switch (domain) {
    case "entry":
      return `/entries/${encodeURIComponent(slugOf(name))}/${eid}/edit`;
    case "term":
      return `/terms/${encodeURIComponent(name)}/${eid}/edit`;
    case "users":
      return `/users/${eid}/edit`;
    default:
      return null;
  }
}

/** {@link resultRoute} under the admin's base path, for a new tab. */
export function resultHref(
  groupKey: string,
  id: string,
  slugOf: (name: string) => string,
): string | null {
  const route = resultRoute(groupKey, id, slugOf);
  return route === null ? null : `${ADMIN_BASE_PATH}${route}`;
}

export function shouldOpenInNewTab(event: {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}): boolean {
  return event.metaKey || event.ctrlKey;
}
