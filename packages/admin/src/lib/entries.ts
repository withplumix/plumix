// Neutral module for entry-list shared constants. Admin-level so any
// route tree (`_authenticated`, `_editor`, future siblings) can import
// without reaching across layouts.
//
// Every field in the list route's `searchSchema` has a `v.fallback`,
// but TanStack Router's typed `Link` / `redirect` calls demand all
// non-optional fields at the call site — hence the named default.
export const ENTRIES_LIST_DEFAULT_SEARCH = {
  status: "all",
  page: 1,
  author: "all",
  orderBy: "updated_at",
  order: "desc",
} as const;
