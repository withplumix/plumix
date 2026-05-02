import type { UserRole } from "../db/schema/users.js";
import type {
  EntryTypeOptions,
  PluginRegistry,
  TermTaxonomyOptions,
} from "../plugin/manifest.js";
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

// Capability shape: `<entity>:<typeName>:<action>` for per-type
// resources (`entry:post:edit_own`, `term:category:manage`); flat
// `<entity>:<action>` for entity-level caps without a type segment
// (`user:list`, `settings:manage`).
//
// `entry:post:*` is the baked-in default — plumix assumes a "post"
// entry type exists out of the box (the conventional default). Other
// entry types and every term taxonomy derive their caps at plugin
// registration time. The `entry:` and `term:` prefixes prevent name
// collisions when an entry type and a taxonomy share a name (e.g.
// `entry:location:read` ≠ `term:location:read`).
//
// `user:*` mirrors WP's split: `list` is editor+, `edit_own` is any
// authenticated user, create / edit / promote / delete are admin-only.
// `promote` is split out from `edit` — role escalation is more
// sensitive than a name/avatar change. `settings:manage` is a single
// gate over both reads and writes (matches WP's `manage_options`).
export const CORE_CAPABILITIES: Readonly<Record<string, UserRole>> =
  Object.freeze({
    "entry:post:read": "subscriber",
    "entry:post:create": "contributor",
    "entry:post:edit_own": "contributor",
    "entry:post:publish": "author",
    "entry:post:edit_any": "editor",
    "entry:post:delete": "editor",
    "user:list": "editor",
    "user:edit_own": "subscriber",
    "user:create": "admin",
    "user:edit": "admin",
    "user:promote": "admin",
    "user:delete": "admin",
    "plugin:manage": "admin",
    "settings:manage": "admin",
  });

export const POST_TYPE_CAPABILITY_ACTIONS = {
  read: "subscriber",
  create: "contributor",
  edit_own: "contributor",
  publish: "author",
  edit_any: "editor",
  delete: "editor",
} as const satisfies Record<string, UserRole>;

export const TERM_TAXONOMY_CAPABILITY_ACTIONS = {
  read: "subscriber",
  assign: "contributor",
  edit: "editor",
  delete: "editor",
  manage: "editor",
} as const satisfies Record<string, UserRole>;

export type PostCapabilityAction = keyof typeof POST_TYPE_CAPABILITY_ACTIONS;
export type TermTaxonomyCapabilityAction =
  keyof typeof TERM_TAXONOMY_CAPABILITY_ACTIONS;
export type CoreCapability = keyof typeof CORE_CAPABILITIES;

export type EntryTypeCapabilityOverrides = Partial<
  Record<PostCapabilityAction, UserRole>
>;

export type TermTaxonomyCapabilityOverrides = Partial<
  Record<TermTaxonomyCapabilityAction, UserRole>
>;

/**
 * Capabilities we know about statically — the built-in core caps. IDE
 * autocomplete picks these up when a `KnownCapability | (string & {})`
 * signature is used (the `string & {}` half preserves flexibility for
 * plugin-defined caps without losing literal suggestions). Derived
 * `{entryType|termTaxonomy}:{action}` shapes deliberately aren't listed here:
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
  overrides: Partial<Record<string, UserRole>> | undefined,
): readonly DerivedCapability[] {
  return Object.entries(actions).map(([action, minRole]) => ({
    name: `${base}:${action}`,
    minRole: overrides?.[action] ?? minRole,
  }));
}

export function deriveEntryTypeCapabilities(
  entryTypeName: string,
  options: EntryTypeOptions,
): readonly DerivedCapability[] {
  // Sharing `capabilityType` across entry types pools their permissions —
  // two plugins both with `capabilityType: "post"` share `entry:post:*`.
  return deriveCapabilities(
    `entry:${options.capabilityType ?? entryTypeName}`,
    POST_TYPE_CAPABILITY_ACTIONS,
    options.capabilities,
  );
}

export function deriveTermTaxonomyCapabilities(
  termTaxonomyName: string,
  options: TermTaxonomyOptions,
): readonly DerivedCapability[] {
  return deriveCapabilities(
    `term:${termTaxonomyName}`,
    TERM_TAXONOMY_CAPABILITY_ACTIONS,
    options.capabilities,
  );
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
      const fromPlugin = plugins.capabilities.get(capability);
      // defaultGrants is an explicit allowlist independent of hierarchy.
      if (fromPlugin?.defaultGrants?.includes(role)) return true;
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

/**
 * Flatten every capability the given role is granted — core plus every
 * plugin-registered capability (including the derived `{type}:{action}`
 * entries). Sorted for deterministic output so wire payloads are stable
 * across identical inputs (tests, caching, etc.).
 *
 * The returned list is intended for shipping to the admin on `auth.session`
 * so client code can gate nav items and actions without knowing the
 * role-hierarchy rules.
 */
export function capabilitiesForRole(
  role: UserRole,
  plugins: PluginRegistry,
): readonly string[] {
  const level = roleLevel(role);
  // Set — a plugin registering an entry type with `capabilityType: 'post'`
  // duplicates the derived `entry:post:read` etc. caps into `plugins.capabilities`
  // on top of the entries already present in CORE_CAPABILITIES. Dedupe so
  // the wire payload doesn't carry `["entry:post:read", "entry:post:read", ...]`.
  const granted = new Set<string>();
  for (const [name, minRole] of Object.entries(CORE_CAPABILITIES)) {
    if (roleLevel(minRole) <= level) granted.add(name);
  }
  for (const [name, cap] of plugins.capabilities) {
    if (roleLevel(cap.minRole) <= level || cap.defaultGrants?.includes(role)) {
      granted.add(name);
    }
  }
  return [...granted].sort();
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
