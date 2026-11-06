/**
 * The roles core ships. A site's own roles reach the admin through its runtime
 * manifest, never a copy (WordPress Trac #55895).
 */
export const DEFAULT_ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const;

/** The roles core ships; `admin` always holds every capability. */
export type DefaultRole = (typeof DEFAULT_ROLES)[number];
