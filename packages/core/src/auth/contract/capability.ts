import type { UserRole } from "../../db/schema/users.js";

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
    "entry:post:read_revisions": "editor",
    "entry:post:restore_revision": "editor",
    "user:list": "editor",
    "user:edit_own": "subscriber",
    "user:create": "admin",
    "user:edit": "admin",
    "user:promote": "admin",
    "user:delete": "admin",
    // Cross-user PAT oversight: list/revoke any user's API tokens.
    // Distinct from `user:edit` so an audit policy can grant "edit
    // profiles but not nuke tokens" or vice-versa. Self-management
    // doesn't need this cap — every authed user manages their own
    // via the self-scoped procedures.
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
  // Revision history reads are an editor concern — authors don't
  // ordinarily look at past versions of their own drafts. Matches the
  // PRD's "editors can see who saved what and when" framing.
  read_revisions: "editor",
  // Restoring a prior revision overwrites the live row. Pairs with
  // `read_revisions` for symmetry with the existing list/get gates;
  // capability lands here so the full surface is consistent before
  // the restore-into-autosave action wires up in a later slice.
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
 * Capabilities we know about statically — the built-in core caps. IDE
 * autocomplete picks these up when a `KnownCapability | (string & {})`
 * signature is used (the `string & {}` half preserves flexibility for
 * plugin-defined caps without losing literal suggestions). Derived
 * `{entryType|termTaxonomy}:{action}` shapes deliberately aren't listed here:
 * `${string}:${action}` collapses to `string` in TypeScript, which would
 * erase the autocomplete benefit for the core strings.
 */
export type KnownCapability = CoreCapability;

/**
 * An entry capability named by what it guards: the entry type and the action.
 * The registry spells it, under the namespace the type pools its permissions
 * into (`capabilityType`), wherever a capability slot is read — so the string
 * a pooled type gates under is never written by hand.
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
 * The string for an entry capability whose namespace is already resolved. The
 * one place the `entry:` shape is spelled; `entryCapability` names the type
 * instead, and a caller holding only a type name wants that.
 */
export function spellEntryCapability(
  namespace: string,
  action: PostCapabilityAction,
): string {
  return `entry:${namespace}:${action}`;
}

/** The string for a term capability. The one place the `term:` shape is spelled. */
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

/**
 * The namespace an entry type named `type` gates under. A name nobody
 * registered pools with nothing, so it is its own namespace.
 */
function entryNamespaceOf(
  registry: CapabilityNamespaces,
  type: string,
): string {
  return registry.entryTypes.get(type)?.capabilityType ?? type;
}

/**
 * The string a capability slot's value gates under. Read at the slot rather
 * than at registration, so a reference to a type a later plugin registers
 * still lands in that type's namespace.
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
