import type { CoreCapability } from "../access/contract/capability.js";
import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { CORE_CAPABILITIES } from "../access/contract/capability.js";
import { rolesFromRank } from "../access/contract/rbac.js";
import { USER_ROLES } from "../db/schema/users.js";

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

function isCoreCapability(name: string): name is CoreCapability {
  return Object.hasOwn(CORE_CAPABILITIES, name);
}

export interface CapabilityResolver {
  /** Returns the minimum role required for a capability, or null if unknown. */
  requiredRole(capability: string): UserRole | null;
  /** True iff the role's resolved capabilities include the capability. */
  hasCapability(role: UserRole, capability: string): boolean;
}

type RoleCapabilityTable = ReadonlyMap<UserRole, ReadonlySet<string>>;

/**
 * A plugin's registration of a core name replaces core's rung for it, so a
 * pooled type's override tightens or loosens `entry:post:*`.
 */
function resolveRoleCapabilities(plugins: PluginRegistry): RoleCapabilityTable {
  const receivers = new Map<string, readonly UserRole[]>(
    Object.entries(CORE_CAPABILITIES).map(([name, minRole]) => [
      name,
      rolesFromRank(minRole),
    ]),
  );
  for (const [name, cap] of plugins.capabilities) {
    receivers.set(name, cap.grantTo);
  }
  return new Map(
    USER_ROLES.map((role) => {
      const granted = new Set<string>();
      for (const [name, roles] of receivers) {
        if (roles.includes(role)) granted.add(name);
      }
      return [role, granted];
    }),
  );
}

/** One table per registry. */
const TABLE_BY_REGISTRY = new WeakMap<PluginRegistry, RoleCapabilityTable>();

function roleCapabilityTable(plugins: PluginRegistry): RoleCapabilityTable {
  let table = TABLE_BY_REGISTRY.get(plugins);
  if (table === undefined) {
    table = resolveRoleCapabilities(plugins);
    TABLE_BY_REGISTRY.set(plugins, table);
  }
  return table;
}

export function createCapabilityResolver(
  plugins: PluginRegistry,
): CapabilityResolver {
  const table = roleCapabilityTable(plugins);
  return {
    requiredRole(capability) {
      const fromPlugin = plugins.capabilities.get(capability);
      // The lowest rung it reaches; `grantTo` is in ladder order.
      if (fromPlugin) return fromPlugin.grantTo[0] ?? null;
      return isCoreCapability(capability)
        ? CORE_CAPABILITIES[capability]
        : null;
    },
    hasCapability(role, capability) {
      return table.get(role)?.has(capability) ?? false;
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
 * Sorted, so the wire payload is stable for identical inputs.
 */
export function capabilitiesForRole(
  role: UserRole,
  plugins: PluginRegistry,
): readonly string[] {
  return [...(roleCapabilityTable(plugins).get(role) ?? [])].sort();
}
