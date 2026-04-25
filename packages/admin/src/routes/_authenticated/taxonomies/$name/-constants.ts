// Default search-param set for `/termTaxonomies/$name`. Sibling routes
// (`/termTaxonomies/$name/new`, `/termTaxonomies/$name/$id`) link back to the
// list with this constant rather than re-declaring the defaults. Kept
// in `-constants.ts` so cross-route imports don't drag the list-route
// module into the sibling chunks (same pattern as `users/-constants.ts`
// and `content/$slug/-constants.ts`).
export const TAXONOMY_LIST_DEFAULT_SEARCH = {
  page: 1,
} as const;
