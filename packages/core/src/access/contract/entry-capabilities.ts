import type { PostCapabilityAction } from "./capability.js";
import { spellEntryCapability } from "./capability.js";

/**
 * A row's bare `type` is not a namespace, since two types may pool one; look a
 * name up with `entryCapabilityNamespace`.
 */
export interface EntryCapabilityNamespace {
  readonly capabilityType: string;
}

export function namespacedEntryCapability(
  namespace: EntryCapabilityNamespace,
  action: PostCapabilityAction,
): string {
  return spellEntryCapability(namespace.capabilityType, action);
}

export interface EntryTypeLookup {
  readonly entryTypes: ReadonlyMap<string, EntryCapabilityNamespace>;
}

/**
 * An unregistered name is its own namespace, which is how core's `entry:post:*`
 * reaches a `post` row on a site that never registered the type.
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
  action: PostCapabilityAction,
): string {
  return namespacedEntryCapability(
    entryCapabilityNamespace(registry, type),
    action,
  );
}
