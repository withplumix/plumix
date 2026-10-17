/**
 * Wire names, not drizzle fields, so a field rename keeps the API. Closed: a
 * registrable column would reach the admin through its runtime manifest, never
 * a copy.
 */
export const ENTRY_LIST_ORDER_COLUMNS = [
  "updated_at",
  "published_at",
  "title",
  "sort_order",
] as const;
