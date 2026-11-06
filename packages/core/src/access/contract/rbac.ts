import type { DefaultRole } from "../../users/contract/roles.js";
import type {
  ActionGrant,
  EntryTypeCapabilityOverrides,
  TermTaxonomyCapabilityOverrides,
} from "./capability.js";
import { DEFAULT_ROLES } from "../../users/contract/roles.js";
import {
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
} from "./capability.js";

/**
 * The default roles a capability goes to, in `DEFAULT_ROLES` order. `admin`
 * holds every capability, so it is always one of them.
 */
export function grantedRoles(
  roles: readonly DefaultRole[],
): readonly DefaultRole[] {
  return DEFAULT_ROLES.filter(
    (role) => role === "admin" || roles.includes(role),
  );
}

export interface DerivedCapability {
  readonly name: string;
  /** The default roles that receive it, `admin` included. */
  readonly grantTo: readonly DefaultRole[];
}

function deriveCapabilities(
  base: string,
  actions: Record<string, ActionGrant>,
  overrides: Partial<Record<string, ActionGrant>> | undefined,
): readonly DerivedCapability[] {
  return Object.entries(actions).map(([action, roles]) => ({
    name: `${base}:${action}`,
    grantTo: grantedRoles(overrides?.[action] ?? roles),
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
