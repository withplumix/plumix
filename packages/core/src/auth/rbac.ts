import type {
  CoreCapability,
  PostCapabilityAction,
} from "../access/contract/capability.js";
import type { RoleDeclaration, RoleGrants } from "../access/contract/roles.js";
import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import {
  CORE_CAPABILITIES,
  entryCapability,
  resolveCapability,
} from "../access/contract/capability.js";
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
  hasCapability(role: string, capability: string): boolean;
  /** True for a default role and for one the config declares. */
  hasRole(role: string): boolean;
}

type RoleCapabilityTable = ReadonlyMap<string, ReadonlySet<string>>;

function defaultReceivers(
  plugins: PluginRegistry,
): ReadonlyMap<string, readonly UserRole[]> {
  // A plugin's registration of a core name replaces core's rung for it, so a
  // pooled type's override tightens or loosens `entry:post:*`.
  const receivers = new Map<string, readonly UserRole[]>(
    Object.entries(CORE_CAPABILITIES).map(([name, minRole]) => [
      name,
      rolesFromRank(minRole),
    ]),
  );
  for (const [name, cap] of plugins.capabilities) {
    receivers.set(name, cap.grantTo);
  }
  return receivers;
}

/** One capability a role's `can` names, and where it was written. */
interface SpelledGrant {
  readonly group: string;
  /** The entry type or taxonomy it is keyed by, for a keyed group. */
  readonly key?: string;
  readonly name: string;
}

function spellKeyedGrant(
  plugins: PluginRegistry,
  group: string,
  key: string,
  action: string,
): string {
  if (group === "entry") {
    return resolveCapability(
      plugins,
      entryCapability(key, action as PostCapabilityAction),
    );
  }
  return `${group}:${key}:${action}`;
}

function spellGrants(
  plugins: PluginRegistry,
  can: RoleGrants,
): readonly SpelledGrant[] {
  const spelled: SpelledGrant[] = [];
  for (const [group, grant] of Object.entries(can)) {
    if (grant === undefined) continue;
    if (isActionList(grant)) {
      for (const action of grant) {
        spelled.push({ group, name: `${group}:${action}` });
      }
      continue;
    }
    for (const [key, actions] of Object.entries(grant)) {
      for (const action of actions ?? []) {
        const name = spellKeyedGrant(plugins, group, key, action);
        spelled.push({ group, key, name });
      }
    }
  }
  return spelled;
}

function isActionList(grant: RoleGrants[string]): grant is readonly string[] {
  return Array.isArray(grant);
}

function declaredRoles(
  plugins: PluginRegistry,
): ReadonlyMap<string, RoleDeclaration> {
  return new Map(
    // `admin` is a type error to declare; a plain-JS config is ignored too.
    Object.entries(plugins.roles).filter(([role]) => role !== "admin"),
  );
}

/**
 * The defaults, then the config's roles over them. A grant nobody registered
 * is dropped; `admin` holds every registered capability.
 */
function resolveRoleCapabilities(plugins: PluginRegistry): RoleCapabilityTable {
  const receivers = defaultReceivers(plugins);
  const table = new Map<string, ReadonlySet<string>>(
    USER_ROLES.map((role) => {
      const granted = new Set<string>();
      for (const [name, roles] of receivers) {
        if (roles.includes(role)) granted.add(name);
      }
      return [role, granted];
    }),
  );
  table.set("admin", new Set(receivers.keys()));

  const declarations = declaredRoles(plugins);
  function ownGrants(declaration: RoleDeclaration): readonly string[] {
    return spellGrants(plugins, declaration.can)
      .map((grant) => grant.name)
      .filter((name) => receivers.has(name));
  }
  // Walks the `extends` chain; a cycle adds nothing past the role it returns to.
  function resolve(role: string): ReadonlySet<string> {
    const granted = new Set<string>();
    const visited = new Set<string>();
    let current: string | undefined = role;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const declaration = declarations.get(current);
      if (declaration === undefined) {
        for (const name of table.get(current) ?? []) granted.add(name);
        break;
      }
      for (const name of ownGrants(declaration)) granted.add(name);
      current = declaration.extends;
    }
    return granted;
  }
  for (const role of declarations.keys()) table.set(role, resolve(role));
  return table;
}

function unknownGrantMessage(
  plugins: PluginRegistry,
  role: string,
  grant: SpelledGrant,
): string {
  if (grant.group === "entry" && !plugins.entryTypes.has(grant.key ?? "")) {
    return `Role "${role}" grants entry type "${grant.key}", which no plugin registers.`;
  }
  if (grant.group === "term" && !plugins.termTaxonomies.has(grant.key ?? "")) {
    return `Role "${role}" grants taxonomy "${grant.key}", which no plugin registers.`;
  }
  return `Role "${role}" grants "${grant.name}", which no plugin registers.`;
}

/**
 * What `plumix build` and dev refuse: each grant, entry type, taxonomy or
 * `extends` target in the config's roles that nothing registered. The running
 * resolver ignores them instead.
 */
export function unknownRoleGrants(plugins: PluginRegistry): readonly string[] {
  const receivers = defaultReceivers(plugins);
  const declarations = declaredRoles(plugins);
  const messages: string[] = [];
  for (const [role, declaration] of declarations) {
    const parent = declaration.extends;
    if (
      parent !== undefined &&
      !declarations.has(parent) &&
      !(USER_ROLES as readonly string[]).includes(parent)
    ) {
      messages.push(`Role "${role}" extends "${parent}", which is not a role.`);
    }
    for (const grant of spellGrants(plugins, declaration.can)) {
      if (receivers.has(grant.name)) continue;
      messages.push(unknownGrantMessage(plugins, role, grant));
    }
  }
  return [...new Set(messages)];
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
    hasRole(role) {
      return table.has(role);
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
  role: string,
  plugins: PluginRegistry,
): readonly string[] {
  return [...(roleCapabilityTable(plugins).get(role) ?? [])].sort();
}
