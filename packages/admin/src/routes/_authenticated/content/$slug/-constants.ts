// Default search-param set for `/content/$slug`. Every field in this
// route's `searchSchema` has a `v.fallback`, but TanStack Router's typed
// `Link` / `redirect` calls demand all non-optional fields at the call
// site. Keeping the defaults here (rather than in the route file) means
// sibling routes — `/content/$slug/new`, `/content/$slug/$id` — can
// import the constant without dragging the list-route's module into
// their chunk via a cross-route import.
export const CONTENT_LIST_DEFAULT_SEARCH = {
  status: "all",
  page: 1,
  author: "all",
  orderBy: "updated_at",
  order: "desc",
} as const;
