/**
 * Closed, so the admin compiles against it. A registrable status reaches the
 * admin through its runtime manifest, never a copy (WordPress Trac #55895).
 */
export const ENTRY_STATUSES = [
  "draft",
  "published",
  "scheduled",
  "trash",
] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];
