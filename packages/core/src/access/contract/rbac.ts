import type { UserRole } from "../../db/schema/users.js";
import type {
  ActionGrant,
  EntryTypeCapabilityOverrides,
  TermTaxonomyCapabilityOverrides,
} from "./capability.js";
import { USER_ROLES } from "../../db/schema/users.js";
import {
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
} from "./capability.js";

/**
 * Role hierarchy (ascending). A role with a higher level has all capabilities
 * of lower roles — e.g., editor satisfies any capability whose minRole is
 * author, contributor, or subscriber.
 */
export const ROLE_LEVEL: Readonly<Record<UserRole, number>> = Object.freeze(
  USER_ROLES.reduce<Record<UserRole, number>>(
    (acc, role, index) => {
      acc[role] = index;
      return acc;
    },
    {} as Record<UserRole, number>,
  ),
);

/** A site role sits on no rung, so it ranks below every one. */
export function roleLevel(role: string): number {
  return Object.hasOwn(ROLE_LEVEL, role) ? ROLE_LEVEL[role as UserRole] : -1;
}

/**
 * Lowest role that may use the admin shell; `subscriber` is the theme-only
 * open-signup tier.
 */
export const STAFF_MIN_ROLE: UserRole = "contributor";

/** True for any staff role, false for a theme-only `subscriber`. */
export function canAccessAdmin(role: string): boolean {
  return roleLevel(role) >= roleLevel(STAFF_MIN_ROLE);
}

/**
 * The default roles a capability goes to, in ladder order. `admin` holds
 * every capability, so it is always one of them.
 */
export function grantedRoles(roles: readonly UserRole[]): readonly UserRole[] {
  return USER_ROLES.filter((role) => role === "admin" || roles.includes(role));
}

/** The ladder form: a minimum rung grants that rung and every one above it. */
export function rolesFromRank(minRole: UserRole): readonly UserRole[] {
  return USER_ROLES.slice(roleLevel(minRole));
}

/** A list names the receiving roles; a single role is the ladder's minimum. */
function grantedRolesOf(grant: ActionGrant): readonly UserRole[] {
  return grantedRoles(typeof grant === "string" ? rolesFromRank(grant) : grant);
}

export interface DerivedCapability {
  readonly name: string;
  /** The default roles that receive it, `admin` included. */
  readonly grantTo: readonly UserRole[];
}

function deriveCapabilities(
  base: string,
  actions: Record<string, UserRole>,
  overrides: Partial<Record<string, ActionGrant>> | undefined,
): readonly DerivedCapability[] {
  return Object.entries(actions).map(([action, minRole]) => ({
    name: `${base}:${action}`,
    grantTo: grantedRolesOf(overrides?.[action] ?? minRole),
  }));
}

export function deriveEntryTypeCapabilities(type: {
  readonly capabilityType: string;
  readonly capabilities?: EntryTypeCapabilityOverrides;
}): readonly DerivedCapability[] {
  return deriveCapabilities(
    `entry:${type.capabilityType}`,
    POST_TYPE_CAPABILITY_ACTIONS,
    type.capabilities,
  );
}

export function deriveTermTaxonomyCapabilities(
  termTaxonomyName: string,
  options: { readonly capabilities?: TermTaxonomyCapabilityOverrides },
): readonly DerivedCapability[] {
  return deriveCapabilities(
    `term:${termTaxonomyName}`,
    TERM_TAXONOMY_CAPABILITY_ACTIONS,
    options.capabilities,
  );
}
