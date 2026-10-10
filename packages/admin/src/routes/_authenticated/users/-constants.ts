import type { UserRole } from "@plumix/core/schema";

// TanStack Router's typed `Link` / `redirect` demand every non-optional field.
// Here so sibling routes don't drag the list-route module into their chunks.
export const USERS_LIST_DEFAULT_SEARCH = {
  page: 1,
  role: "all",
} as const;

// Local: importing core's runtime symbol would pull drizzle into the admin
// bundle.
export const USER_ROLES: readonly UserRole[] = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
