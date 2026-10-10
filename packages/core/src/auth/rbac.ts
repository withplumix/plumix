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

/**
 * The registry has stable per-app identity; weak keys free the resolver with a
 * discarded registry.
 */
const RESOLVER_BY_REGISTRY = new WeakMap<PluginRegistry, CapabilityResolver>();

/**
 * Returns the same resolver for the same registry, so callers never rebuild
 * one.
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
 * Sorted and deduplicated, so the wire payload is stable for identical inputs.
 */
export function capabilitiesForRole(
  role: UserRole,
  plugins: PluginRegistry,
): readonly string[] {
  const level = roleLevel(role);
  // `capabilityType: 'post'` re-registers caps already in CORE_CAPABILITIES.
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
