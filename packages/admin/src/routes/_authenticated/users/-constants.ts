import type { UserRole } from "@plumix/core/schema";
import { USER_ROLES } from "@plumix/core/manifest";

/**
 * TanStack Router's typed `Link` / `redirect` demand every non-optional field.
 * Here so sibling routes don't drag the list-route module into their chunks.
 */
export const USERS_LIST_DEFAULT_SEARCH = {
  page: 1,
  role: "all",
} as const;

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
