// Default search-param set for `/users`. Every field in this route's
// `searchSchema` has a `v.fallback`, but TanStack Router's typed `Link`
// / `redirect` calls demand all non-optional fields at the call site.
// Keeping the defaults here (rather than in the route file) means
// sibling routes — `/users/new`, the future `/users/$id` — can import
// the constant without dragging the list-route's module into their
// chunk via a cross-route import.
export const USERS_LIST_DEFAULT_SEARCH = {
  page: 1,
  role: "all",
} as const;
