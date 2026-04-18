import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry, PostTypeOptions } from "../plugin/manifest.js";
import { USER_ROLES } from "../db/schema/users.js";

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

// `post:*` and `taxonomy:manage` are the built-in fallbacks — present even
// before any plugin registers a type. Plugins registering a post type with
// `capabilityType: 'post'` (the default) just inherit `post:*` via the
// dedupe rule in `registerPostType`. `user`/`plugin`/`option` aren't tied
// to content entities so they only live here.
//
// `user:*` mirrors WordPress's split: list is editor+, profile self-edit is
// any authenticated user, but creating / editing / promoting / deleting
// other users is admin-only. `promote` is separate from `edit` because role
// escalation is more sensitive than a name/avatar change.
// `option:manage` is a single gate over both reads and writes, matching WP's
// `manage_options`. Options can contain admin-only config; if a specific
// option needs broader read access, expose it via a dedicated RPC procedure
// that reads it server-side — don't widen `option.*`.
export const CORE_CAPABILITIES: Readonly<Record<string, UserRole>> =
  Object.freeze({
    "post:read": "subscriber",
    "post:create": "contributor",
    "post:edit_own": "contributor",
    "post:publish": "author",
    "post:edit_any": "editor",
    "post:delete": "editor",
    "taxonomy:manage": "editor",
    "user:list": "editor",
    "user:edit_own": "subscriber",
    "user:create": "admin",
    "user:edit": "admin",
    "user:promote": "admin",
    "user:delete": "admin",
    "plugin:manage": "admin",
    "option:manage": "admin",
  });

export const POST_TYPE_CAPABILITY_ACTIONS = {
  read: "subscriber",
  create: "contributor",
  edit_own: "contributor",
  publish: "author",
  edit_any: "editor",
  delete: "editor",
} as const satisfies Record<string, UserRole>;

export const TAXONOMY_CAPABILITY_ACTIONS = {
  read: "subscriber",
  assign: "contributor",
  edit: "editor",
  delete: "editor",
  manage: "editor",
} as const satisfies Record<string, UserRole>;

export type PostCapabilityAction = keyof typeof POST_TYPE_CAPABILITY_ACTIONS;
export type TaxonomyCapabilityAction = keyof typeof TAXONOMY_CAPABILITY_ACTIONS;
export type CoreCapability = keyof typeof CORE_CAPABILITIES;

/**
 * Capabilities we know about statically — the built-in core caps. IDE
 * autocomplete picks these up when a `KnownCapability | (string & {})`
 * signature is used (the `string & {}` half preserves flexibility for
 * plugin-defined caps without losing literal suggestions). Derived
 * `{postType|taxonomy}:{action}` shapes deliberately aren't listed here:
 * `${string}:${action}` collapses to `string` in TypeScript, which would
 * erase the autocomplete benefit for the core strings.
 */
export type KnownCapability = CoreCapability;

export interface DerivedCapability {
  readonly name: string;
  readonly minRole: UserRole;
}

function deriveCapabilities(
  base: string,
  actions: Record<string, UserRole>,
): readonly DerivedCapability[] {
  return Object.entries(actions).map(([action, minRole]) => ({
    name: `${base}:${action}`,
    minRole,
  }));
}

export function derivePostTypeCapabilities(
  postTypeName: string,
  options: PostTypeOptions,
): readonly DerivedCapability[] {
  // Sharing `capabilityType` across post types pools their permissions —
  // that's how the built-in `post` scheme extends to plugin-registered types.
  return deriveCapabilities(
    options.capabilityType ?? postTypeName,
    POST_TYPE_CAPABILITY_ACTIONS,
  );
}

export function deriveTaxonomyCapabilities(
  taxonomyName: string,
): readonly DerivedCapability[] {
  return deriveCapabilities(taxonomyName, TAXONOMY_CAPABILITY_ACTIONS);
}

export interface CapabilityResolver {
  /** Returns the minimum role required for a capability, or null if unknown. */
  requiredRole(capability: string): UserRole | null;
  /** True iff the given role meets the capability's minimum role. */
  hasCapability(role: UserRole, capability: string): boolean;
}

export function createCapabilityResolver(
  plugins: PluginRegistry,
): CapabilityResolver {
  return {
    requiredRole(capability) {
      const fromPlugin = plugins.capabilities.get(capability);
      if (fromPlugin) return fromPlugin.minRole;
      return CORE_CAPABILITIES[capability] ?? null;
    },
    hasCapability(role, capability) {
      const required = this.requiredRole(capability);
      if (required === null) return false;
      return roleLevel(role) >= roleLevel(required);
    },
  };
}

export class CapabilityError extends Error {
  readonly code: "unauthorized" | "forbidden";
  readonly capability: string;

  constructor(
    code: "unauthorized" | "forbidden",
    capability: string,
    message?: string,
  ) {
    super(message ?? `${code}: ${capability}`);
    this.name = "CapabilityError";
    this.code = code;
    this.capability = capability;
  }
}

export function requireCapability(
  resolver: CapabilityResolver,
  user: { role: UserRole } | null,
  capability: string,
): void {
  if (!user)
    throw new CapabilityError(
      "unauthorized",
      capability,
      "Authentication required",
    );
  if (!resolver.hasCapability(user.role, capability)) {
    throw new CapabilityError(
      "forbidden",
      capability,
      `Missing capability: ${capability}`,
    );
  }
}
