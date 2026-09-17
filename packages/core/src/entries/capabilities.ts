import type {
  PluginRegistry,
  RegisteredEntryType,
} from "../plugin/registry.js";

/**
 * The namespace an entry type's `entry:<capabilityType>:*` capabilities live
 * under. A registered type carries it, resolved at registration; a row's bare
 * `type` string does not, since two types may pool one namespace — look a
 * name up with `entryCapabilityNamespace`.
 */
export type EntryCapabilityNamespace = Pick<
  RegisteredEntryType,
  "capabilityType"
>;

export function entryCapability(
  namespace: EntryCapabilityNamespace,
  action: string,
): string {
  return `entry:${namespace.capabilityType}:${action}`;
}

export type EntryTypeLookup = Pick<PluginRegistry, "entryTypes">;

/**
 * The namespace behind the entry type named `type`, looked up through the
 * registry so a pooled type is gated by the namespace it pools under. A name
 * nobody registered pools with nothing, so it is its own namespace: a check
 * then denies unless a capability was minted under that name outright, which
 * is how core's `entry:post:*` reaches a `post` row on a site that never
 * registered the type.
 */
export function entryCapabilityNamespace(
  registry: EntryTypeLookup,
  type: string,
): EntryCapabilityNamespace {
  return registry.entryTypes.get(type) ?? { capabilityType: type };
}

export function entryCapabilityByName(
  registry: EntryTypeLookup,
  type: string,
  action: string,
): string {
  return entryCapability(entryCapabilityNamespace(registry, type), action);
}
