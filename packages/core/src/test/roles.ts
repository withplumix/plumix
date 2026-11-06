import type { SiteRoles } from "../access/contract/roles.js";

/**
 * A site role that writes posts and tags them but never publishes, the core
 * rights of a `contributor`. Pass it to
 * `createPluginRegistry(undefined, CONTRIBUTOR_ROLE)` and act as
 * `"contributor"`.
 */
export const CONTRIBUTOR_ROLE = {
  contributor: {
    can: {
      admin: ["access"],
      user: ["edit_own"],
      entry: { post: ["read", "create", "edit_own"] },
      term: { category: ["read", "assign"], tag: ["read", "assign"] },
    },
  },
} as const satisfies SiteRoles;
