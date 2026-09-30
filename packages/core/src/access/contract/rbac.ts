import type { UserRole } from "../../db/schema/users.js";
import type {
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

export function roleLevel(role: UserRole): number {
  return ROLE_LEVEL[role];
}

/**
 * Lowest role that may use the admin shell. `subscriber` is the theme-only
 * visitor tier (the open-signup default); every role from `contributor` up is
 * staff. Keying the admin-lockout guard on this rather than a bespoke
 * capability keeps "who is staff" a single named boundary.
 */
export const STAFF_MIN_ROLE: UserRole = "contributor";

/** True for any staff role, false for a theme-only `subscriber`. */
export function canAccessAdmin(role: UserRole): boolean {
  return roleLevel(role) >= roleLevel(STAFF_MIN_ROLE);
}

export interface DerivedCapability {
  readonly name: string;
  readonly minRole: UserRole;
}

function deriveCapabilities(
  base: string,
  actions: Record<string, UserRole>,
  overrides: Partial<Record<string, UserRole>> | undefined,
): readonly DerivedCapability[] {
  return Object.entries(actions).map(([action, minRole]) => ({
    name: `${base}:${action}`,
    minRole: overrides?.[action] ?? minRole,
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
