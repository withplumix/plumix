import { ADMIN_BASE_PATH } from "./constants.js";

/** Split a search group key into its domain and remainder (`entry:post`
 *  → `{ domain: "entry", name: "post" }`; `users` → `{ "users", "" }`). */
export function parseGroupKey(groupKey: string): {
  readonly domain: string;
  readonly name: string;
} {
  const sep = groupKey.indexOf(":");
  return sep === -1
    ? { domain: groupKey, name: "" }
    : { domain: groupKey.slice(0, sep), name: groupKey.slice(sep + 1) };
}

/** Full admin URL for a content result, for opening in a new tab. Mirrors
 *  the in-app routes; `null` for an unroutable domain. `resolveSlug` maps
 *  an entry-type name to its admin slug. Segments are encoded to match the
 *  router's encoding on the SPA path. */
export function resultHref(
  groupKey: string,
  id: string,
  resolveSlug: (name: string) => string,
): string | null {
  const { domain, name } = parseGroupKey(groupKey);
  const eid = encodeURIComponent(id);
  switch (domain) {
    case "entry":
      return `${ADMIN_BASE_PATH}/entries/${encodeURIComponent(resolveSlug(name))}/${eid}/edit`;
    case "term":
      return `${ADMIN_BASE_PATH}/terms/${encodeURIComponent(name)}/${eid}/edit`;
    case "users":
      return `${ADMIN_BASE_PATH}/users/${eid}/edit`;
    default:
      return null;
  }
}

export function shouldOpenInNewTab(event: {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}): boolean {
  return event.metaKey || event.ctrlKey;
}
