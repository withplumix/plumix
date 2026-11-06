import type { DefaultRole } from "../../users/contract/roles.js";

const MEMBERS = ["subscriber", "contributor", "author", "editor"] as const;
const WRITERS = ["contributor", "author", "editor"] as const;
const PUBLISHERS = ["author", "editor"] as const;
const EDITORS = ["editor"] as const;
/** `admin` holds every capability, so a list never names it. */
const ADMIN_ONLY = [] as const;

/**
 * The default roles each core capability goes to.
 * `entry:`/`term:` prefixes keep an entry type and a same-named taxonomy apart.
 * `promote` is split from `edit`: role escalation outranks a profile change.
 */
export const CORE_CAPABILITIES = Object.freeze({
  // `subscriber` is the theme-only open-signup role, which gets no admin.
  "admin:access": WRITERS,
  "entry:post:read": MEMBERS,
  "entry:post:create": WRITERS,
  "entry:post:edit_own": WRITERS,
  "entry:post:publish": PUBLISHERS,
  "entry:post:edit_any": EDITORS,
  "entry:post:delete": EDITORS,
  "entry:post:read_revisions": EDITORS,
  "entry:post:restore_revision": EDITORS,
  "entry:post:edit_layout": PUBLISHERS,
  "user:list": EDITORS,
  "user:edit_own": MEMBERS,
  "user:create": ADMIN_ONLY,
  "user:edit": ADMIN_ONLY,
  "user:promote": ADMIN_ONLY,
  "user:delete": ADMIN_ONLY,
  // Any user's API tokens. Separate from `user:edit` so a policy can grant
  // one without the other; users manage their own tokens without it.
  "user:manage_tokens": ADMIN_ONLY,
  "settings:manage": ADMIN_ONLY,
} as const satisfies Record<string, readonly DefaultRole[]>);

export const POST_TYPE_CAPABILITY_ACTIONS = {
  read: MEMBERS,
  create: WRITERS,
  edit_own: WRITERS,
  publish: PUBLISHERS,
  edit_any: EDITORS,
  delete: EDITORS,
  read_revisions: EDITORS,
  // Restoring overwrites the live row.
  restore_revision: EDITORS,
  // Structure and style; `edit_own`/`edit_any` alone change only the inputs a
  // block marks `content`.
  edit_layout: PUBLISHERS,
} as const satisfies Record<string, readonly DefaultRole[]>;

export const TERM_TAXONOMY_CAPABILITY_ACTIONS = {
  read: MEMBERS,
  assign: WRITERS,
  edit: EDITORS,
  delete: EDITORS,
  manage: EDITORS,
} as const satisfies Record<string, readonly DefaultRole[]>;

export type PostCapabilityAction = keyof typeof POST_TYPE_CAPABILITY_ACTIONS;
export type TermTaxonomyCapabilityAction =
  keyof typeof TERM_TAXONOMY_CAPABILITY_ACTIONS;
export type CoreCapability = keyof typeof CORE_CAPABILITIES;

/** The default roles that receive an action; `admin` always does. */
export type ActionGrant = readonly DefaultRole[];

export type EntryTypeCapabilityOverrides = Partial<
  Record<PostCapabilityAction, ActionGrant>
>;

export type TermTaxonomyCapabilityOverrides = Partial<
  Record<TermTaxonomyCapabilityAction, ActionGrant>
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

/** An unregistered type pools with nothing, so it is its own namespace. */
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
