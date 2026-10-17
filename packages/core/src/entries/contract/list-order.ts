/**
 * Wire names, not drizzle field names, so the API stays stable if the TS
 * fields are renamed.
 */
export const ENTRY_LIST_ORDER_COLUMNS = [
  "updated_at",
  "published_at",
  "title",
  "sort_order",
] as const;
