import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { CORE_CAPABILITIES } from "../access/contract/capability.js";
import { roleLevel } from "../access/contract/rbac.js";

// The capability vocabulary lives in `access/contract/` so the plugin and
// context contracts can name it; re-exported here for existing callers.
export {
  CORE_CAPABILITIES,
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
} from "../access/contract/capability.js";
export type {
  CoreCapability,
  EntryTypeCapabilityOverrides,
  KnownCapability,
  PostCapabilityAction,
  TermTaxonomyCapabilityAction,
  TermTaxonomyCapabilityOverrides,
} from "../access/contract/capability.js";

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
