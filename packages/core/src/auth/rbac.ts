import type { UserRole } from "../db/schema/users.js";
import type {
  PluginRegistry,
  RegisteredEntryType,
  TermTaxonomyOptions,
} from "../plugin/manifest.js";
import { USER_ROLES } from "../db/schema/users.js";
import {
  CORE_CAPABILITIES,
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
} from "./contract/capability.js";

// The capability vocabulary lives in the contract below this layer, so the
// plugin and context contracts can name it; re-exported here for the callers
// that have always read it from `rbac`.
export {
  CORE_CAPABILITIES,
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
} from "./contract/capability.js";
export type {
  CoreCapability,
  EntryTypeCapabilityOverrides,
  KnownCapability,
  PostCapabilityAction,
  TermTaxonomyCapabilityAction,
  TermTaxonomyCapabilityOverrides,
} from "./contract/capability.js";

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

export function deriveEntryTypeCapabilities(
  type: Pick<RegisteredEntryType, "capabilityType" | "capabilities">,
): readonly DerivedCapability[] {
  return deriveCapabilities(
    `entry:${type.capabilityType}`,
    POST_TYPE_CAPABILITY_ACTIONS,
    type.capabilities,
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

// The resolver is a pure function of the plugin registry, which has stable
// per-app identity — so one resolver serves an app for its whole lifetime.
// Weak-keyed so a discarded registry (e.g. a torn-down test app) frees its
// resolver with it.
const RESOLVER_BY_REGISTRY = new WeakMap<PluginRegistry, CapabilityResolver>();

/**
 * Every construction site — app build, context creation, user upgrade,
 * plugin-raw-route dispatch — routes through here, so an authentication upgrade
 * reuses the app's resolver instead of rebuilding an identical one.
 */
export function getCapabilityResolver(
  plugins: PluginRegistry,
): CapabilityResolver {
  let resolver = RESOLVER_BY_REGISTRY.get(plugins);
  if (resolver === undefined) {
    resolver = createCapabilityResolver(plugins);
    RESOLVER_BY_REGISTRY.set(plugins, resolver);
  }
  return resolver;
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
