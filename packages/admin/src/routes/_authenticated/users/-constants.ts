/**
 * TanStack Router's typed `Link` / `redirect` demand every non-optional field.
 * Here so sibling routes don't drag the list-route module into their chunks.
 */
export const USERS_LIST_DEFAULT_SEARCH = {
  page: 1,
  role: "all",
} as const;
