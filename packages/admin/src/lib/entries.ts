// TanStack Router's typed `Link` / `redirect` demand every non-optional search
// field, despite the schema's fallbacks.
export const ENTRIES_LIST_DEFAULT_SEARCH = {
  status: "all",
  page: 1,
  author: "all",
  orderBy: "updated_at",
  order: "desc",
} as const;
