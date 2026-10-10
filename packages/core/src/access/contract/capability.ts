import type { UserRole } from "../../db/schema/users.js";

// `entry:`/`term:` prefixes keep an entry type and a same-named taxonomy apart.
// `promote` is split from `edit`: role escalation outranks a profile change.
export const CORE_CAPABILITIES: Readonly<Record<string, UserRole>> =
  Object.freeze({
    "entry:post:read": "subscriber",
    "entry:post:create": "contributor",
    "entry:post:edit_own": "contributor",
    "entry:post:publish": "author",
    "entry:post:edit_any": "editor",
    "entry:post:delete": "editor",
    "entry:post:read_revisions": "editor",
    "entry:post:restore_revision": "editor",
    "user:list": "editor",
    "user:edit_own": "subscriber",
    "user:create": "admin",
    "user:edit": "admin",
    "user:promote": "admin",
    "user:delete": "admin",
    // Any user's API tokens. Separate from `user:edit` so a policy can grant
    // one without the other; users manage their own tokens without it.
    "user:manage_tokens": "admin",
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
  read_revisions: "editor",
  // Restoring overwrites the live row.
  restore_revision: "editor",
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
 * Excludes derived `entry:`/`term:` shapes: `${string}:${action}` collapses to
 * `string` and would erase autocomplete for the core literals.
 */
export type KnownCapability = CoreCapability;

/**
 * Spelled under the type's `capabilityType` namespace when a slot is read, so a
 * pooled type's capability string is never written by hand.
 */
export interface EntryCapability {
  readonly kind: "entry";
  readonly entryType: string;
  readonly action: PostCapabilityAction;
}

/** A term capability named by taxonomy and action. Terms don't pool. */
export interface TermCapability {
  readonly kind: "term";
  readonly taxonomy: string;
  readonly action: TermTaxonomyCapabilityAction;
}

/**
 * What every capability slot accepts. A reference is resolved to its string
 * where the slot is read; whatever leaves the server stays a string.
 */
export type Capability =
  KnownCapability | EntryCapability | TermCapability | (string & {});

export function entryCapability(
  entryType: string,
  action: PostCapabilityAction,
): EntryCapability {
  return Object.freeze({ kind: "entry", entryType, action });
}

export function termCapability(
  taxonomy: string,
  action: TermTaxonomyCapabilityAction,
): TermCapability {
  return Object.freeze({ kind: "term", taxonomy, action });
}

/**
 * Takes an already-resolved namespace, not a type name; a caller holding a type
 * name wants `entryCapability`.
 */
export function spellEntryCapability(
  namespace: string,
  action: PostCapabilityAction,
): string {
  return `entry:${namespace}:${action}`;
}

/**
 * The string for a term capability. The one place the `term:` shape is spelled.
 */
export function spellTermCapability(
  taxonomy: string,
  action: TermTaxonomyCapabilityAction,
): string {
  return `term:${taxonomy}:${action}`;
}

/**
 * What resolving a reference reads: the namespace each registered entry type
 * pools its permissions into. The plugin registry satisfies it.
 */
export interface CapabilityNamespaces {
  readonly entryTypes: ReadonlyMap<string, { readonly capabilityType: string }>;
}

// An unregistered type pools with nothing, so it is its own namespace.
function entryNamespaceOf(
  registry: CapabilityNamespaces,
  type: string,
): string {
  return registry.entryTypes.get(type)?.capabilityType ?? type;
}

/**
 * Resolved at the slot, not at registration, so a reference to a type a later
 * plugin registers still lands in its namespace.
 */
export function resolveCapability(
  registry: CapabilityNamespaces,
  capability: Capability,
): string {
  if (typeof capability === "string") return capability;
  if (capability.kind === "term") {
    return spellTermCapability(capability.taxonomy, capability.action);
  }
  return spellEntryCapability(
    entryNamespaceOf(registry, capability.entryType),
    capability.action,
  );
}
