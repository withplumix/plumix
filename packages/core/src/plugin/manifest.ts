import type {
  EntryTypeCapabilityOverrides,
  TermTaxonomyCapabilityOverrides,
} from "../auth/rbac.js";
import type { AppContext } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import type { RouteIntent } from "../route/intent.js";
import type { RegisteredLookupAdapter } from "./lookup.js";

export interface EntryTypeOptions {
  readonly label: string;
  /**
   * Human-readable label variants. `plural` also drives the admin URL slug
   * (`/entries/<slugified-plural>`) unless overridden; omit it and the slug
   * falls back to `${name}s`, which is acceptable for English-named types
   * but surfaces an "anglos" for `name: "angle"` etc. — plugins with
   * irregular plurals should set `labels.plural` explicitly.
   */
  readonly labels?: {
    readonly singular?: string;
    readonly plural?: string;
  };
  readonly description?: string;
  readonly supports?: readonly string[];
  readonly termTaxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  /** Master visibility switch; defaults to `true`. Cascades to `showUI`/`showInSidebar`/`excludeFromGenericRpc`/`excludeFromSearch` when those are unset. */
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly excludeFromGenericRpc?: boolean;
  readonly excludeFromSearch?: boolean;
  readonly hasArchive?: boolean | string;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
  readonly capabilityType?: string;
  readonly capabilities?: EntryTypeCapabilityOverrides;
  readonly priority?: number;
  readonly menuIcon?: string;
}

export interface TermTaxonomyOptions {
  readonly label: string;
  readonly labels?: { readonly singular?: string };
  readonly description?: string;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly excludeFromGenericRpc?: boolean;
  readonly isInQuickEdit?: boolean;
  readonly hasAdminColumn?: boolean;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
  readonly capabilities?: TermTaxonomyCapabilityOverrides;
  readonly menuIcon?: string;
}

export function resolveEntryTypeVisibility(options: EntryTypeOptions): {
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly excludeFromGenericRpc: boolean;
  readonly excludeFromSearch: boolean;
} {
  const isPublic = options.isPublic ?? true;
  const showUI = options.showUI ?? isPublic;
  return {
    isPublic,
    showUI,
    showInSidebar: options.showInSidebar ?? showUI,
    excludeFromGenericRpc: options.excludeFromGenericRpc ?? !isPublic,
    excludeFromSearch: options.excludeFromSearch ?? !isPublic,
  };
}

export function resolveTermTaxonomyVisibility(options: TermTaxonomyOptions): {
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly excludeFromGenericRpc: boolean;
} {
  const isPublic = options.isPublic ?? true;
  const showUI = options.showUI ?? isPublic;
  return {
    isPublic,
    showUI,
    showInSidebar: options.showInSidebar ?? showUI,
    excludeFromGenericRpc: options.excludeFromGenericRpc ?? !isPublic,
  };
}

export function manifestEntryVisibility(
  entry:
    | Pick<EntryTypeManifestEntry, "isPublic" | "showUI" | "showInSidebar">
    | Pick<TermTaxonomyManifestEntry, "isPublic" | "showUI" | "showInSidebar">,
): {
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
} {
  const isPublic = entry.isPublic ?? true;
  const showUI = entry.showUI ?? isPublic;
  return {
    isPublic,
    showUI,
    showInSidebar: entry.showInSidebar ?? showUI,
  };
}

export type MetaScalarType = "string" | "number" | "boolean" | "json";

export interface MetaBoxFieldOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Column span for a field within its meta box's 12-column grid. A plain
 * number applies from the smallest breakpoint up. The object form is
 * mobile-first: `base` is the default, `sm` / `md` / `lg` override upward.
 * Breakpoints key off the card's own width (Tailwind container queries,
 * `@sm` / `@md` / `@lg`) so the same `span` renders consistently whether
 * the box lands in a full-width route or a narrow sidebar. Values outside
 * 1..12 are clamped at render time. Omitted span means full width (12).
 */
export type MetaBoxFieldSpan =
  | number
  | {
      readonly base?: number;
      readonly sm?: number;
      readonly md?: number;
      readonly lg?: number;
    };

/**
 * Shared shape for every meta-box field variant — properties carried
 * regardless of `inputType`. Each narrowed variant of `MetaBoxField`
 * extends this with input-specific options.
 */
export interface MetaBoxFieldBase {
  readonly key: string;
  readonly label: string;
  /**
   * Storage type. Drives server-side sanitization on write and
   * coercion on read (`entry.meta` / `term.meta` columns store JSON,
   * but the type informs the expected shape). `json` accepts any
   * JSON-serialisable value.
   */
  readonly type: MetaScalarType;
  /**
   * Applied after type coercion, before persistence. Returning a
   * sanitized value replaces the caller's input — ideal for trimming,
   * whitelisting, or normalising shape.
   */
  readonly sanitize?: (value: unknown) => unknown;
  /** Default surfaced in the admin form when the key has no saved value. */
  readonly default?: unknown;
  /** Optional help text rendered under the label on every input type. */
  readonly description?: string;
  /** Renders `required` on the native input; server validation is separate. */
  readonly required?: boolean;
  /**
   * Column span within the meta box's 12-column grid. Defaults to full
   * width. See `MetaBoxFieldSpan` for the responsive object form.
   */
  readonly span?: MetaBoxFieldSpan;
}

/**
 * The narrowed `text` field variant produced by the `text()` builder
 * helper exported from `plumix/fields`. The builder rejects options
 * that don't apply to a text input (e.g. `min`, `step`, `options`) at
 * the type level; downstream consumers can rely on the narrowed shape
 * via the `inputType` discriminator.
 */
export interface TextMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "text";
  readonly type: "string";
  readonly placeholder?: string;
  readonly maxLength?: number;
}

/** Multi-line text input. Storage shape mirrors `text`. */
export interface TextareaMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "textarea";
  readonly type: "string";
  readonly placeholder?: string;
  readonly maxLength?: number;
}

/** Numeric input with optional `min` / `max` / `step` bounds. */
export interface NumberMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "number";
  readonly type: "number";
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/** RFC-5322-shaped email input. */
export interface EmailMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "email";
  readonly type: "string";
  readonly placeholder?: string;
  readonly maxLength?: number;
}

/** URL input. */
export interface UrlMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "url";
  readonly type: "string";
  readonly placeholder?: string;
  readonly maxLength?: number;
}

/**
 * Masked-input password field. Visually hides characters in the admin
 * so values aren't shoulder-surfable in shared sessions; storage
 * shape mirrors `text`.
 */
export interface PasswordMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "password";
  readonly type: "string";
  readonly placeholder?: string;
  readonly maxLength?: number;
}

/**
 * Date-only field. Stored as `YYYY-MM-DD` (ISO 8601 calendar date,
 * no time, no timezone). Optional `min` / `max` bounds use the same
 * format and are enforced as registration-time validation only —
 * server-side bound enforcement is deferred to a later release.
 */
export interface DateMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "date";
  readonly type: "string";
  readonly min?: string;
  readonly max?: string;
}

/**
 * Date + time field. Stored as a partial ISO 8601 string
 * (`YYYY-MM-DDTHH:MM` with optional `:SS`) reflecting whatever the
 * author's browser produced via `<input type="datetime-local">`. A
 * future iteration may bake in the browser's timezone offset so the
 * wall-clock semantics survive cross-region reads; today's storage is
 * naive local time and consumers anchor to a timezone explicitly via
 * `parseMetaDate` + their own `Temporal.ZonedDateTime` shaping if
 * needed.
 */
export interface DateTimeMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "datetime";
  readonly type: "string";
  readonly min?: string;
  readonly max?: string;
}

/**
 * Time-only field. Stored as `HH:MM` (with optional `:SS`). No date
 * anchor, no timezone — useful for "open at 09:00" style values where
 * the calendar date is supplied separately.
 */
export interface TimeMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "time";
  readonly type: "string";
  readonly min?: string;
  readonly max?: string;
}

/**
 * Hex color picker. Stored as a `#xxxxxx` string (the format the
 * native `<input type="color">` produces). The builder injects a
 * default sanitizer that rejects values that don't match the hex
 * shape on write.
 */
export interface ColorMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "color";
  readonly type: "string";
}

/**
 * Bounded numeric slider. Renders as `<input type="range">`. `min` /
 * `max` are required so the slider has a concrete range; `step`
 * defaults to `1`. The builder injects a default sanitizer that
 * enforces the bounds on write.
 */
export interface RangeMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "range";
  readonly type: "number";
  readonly min: number;
  readonly max: number;
  readonly step?: number;
}

/**
 * Multi-value picker over a fixed option list. Storage is a JSON
 * array of option `value` strings. Renders as a toggle group in the
 * admin so authors see all options at once. The builder ships a
 * default sanitizer that rejects values outside the declared
 * options.
 */
export interface MultiselectMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "multiselect";
  readonly type: "json";
  readonly options: readonly MetaBoxFieldOption[];
}

/**
 * Free-form JSON value. Storage round-trips through the JSON
 * serializer so any structure that survives `JSON.stringify`
 * survives the wire.
 */
export interface JsonMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "json";
  readonly type: "json";
}

/**
 * Reference target descriptor carried on every reference field
 * variant (`user`, `entry`, `term`, `media`, plugin-registered
 * custom kinds). The `kind` matches a registered `LookupAdapter`;
 * the adapter interprets `scope` according to its own contract.
 *
 * Reading the manifest, the admin dispatches to a generic picker
 * that calls the lookup RPC with `{ kind, scope }` — picker UI is
 * one component, target-specific knowledge lives in the adapter.
 */
export interface ReferenceTarget<TScope = unknown> {
  readonly kind: string;
  readonly scope?: TScope;
  /**
   * Storage cardinality. `false`/absent → single value (string or
   * cached object). `true` → array (of strings or cached objects).
   * The server-side write validator and read-side orphan filter
   * dispatch on this flag to handle both shapes uniformly.
   */
  readonly multiple?: boolean;
  /**
   * Storage shape per item. `"id"` (default) → bare id string —
   * every read needs a join/resolve to get a label. `"object"` →
   * `{ id, ...cachedFields, ...userFields }` — the meta pipeline
   * normalizes cached fields from the adapter on every write so
   * reads can render without a join. Used by `media` (where the
   * thumbnail/mime/filename are needed on every render and a
   * resolve per render is wasteful on the edge).
   *
   * The cached fields come from `LookupResult.cached` returned by
   * the adapter; user-supplied keys (e.g. per-usage `alt`) survive
   * the merge so editors can override per-usage metadata.
   */
  readonly valueShape?: "id" | "object";
}

/**
 * Single user reference. Storage is the bare user id as a string
 * (`"42"` → `users.id = 42`); reads return `null` when the user is
 * gone or no longer matches scope. The `referenceTarget.scope`
 * accepts the user adapter's scope shape (roles + disabled-state).
 */
export interface UserMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "user";
  readonly type: "string";
  readonly referenceTarget: ReferenceTarget;
}

/**
 * Multi user reference. Storage is a JSON array of bare user ids
 * (`["42", "43"]`); reads filter out orphans (the bag's array stays
 * dense — missing IDs are dropped, not nulled, so consumers iterate
 * without branching). `referenceTarget.multiple` is `true`; `max`
 * caps the array length at write time.
 */
export interface UserListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "userList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Single entry reference. Storage is the bare entry id as a string;
 * reads return `null` when the entry is gone, scope-mismatched, or
 * trashed. `referenceTarget.scope` carries `entryTypes` (the only
 * entry-type names this field accepts).
 *
 * Naming note: the `Reference` infix avoids the collision with
 * `EntryMetaBoxField` further down — the latter is the per-variant
 * Omit-distributive union for fields inside an entry meta box.
 */
export interface EntryReferenceMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "entry";
  readonly type: "string";
  readonly referenceTarget: ReferenceTarget;
}

/**
 * Multi entry reference. Storage is a JSON array of bare entry ids;
 * reads filter out orphans (the array stays dense — missing IDs are
 * dropped, not nulled). `referenceTarget.multiple` is `true`; `max`
 * caps the array length at write time. Scope rules match
 * `EntryReferenceMetaBoxField` — `entryTypes` is required.
 */
export interface EntryListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "entryList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Single term reference. Storage is the bare term id as a string;
 * reads return `null` for orphans / scope mismatches.
 * `referenceTarget.scope` carries `termTaxonomies` (the taxonomy
 * names this field accepts).
 */
export interface TermReferenceMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "term";
  readonly type: "string";
  readonly referenceTarget: ReferenceTarget;
}

/**
 * Multi term reference. Storage is a JSON array of bare term ids;
 * reads filter out orphans the same way `EntryListMetaBoxField`
 * does. `referenceTarget.multiple` is `true`; `max` caps array
 * length. Scope rules match `TermReferenceMetaBoxField` —
 * `termTaxonomies` is required.
 */
export interface TermListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "termList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Single media reference with cached metadata. Storage is the
 * `MediaValue` object — `{ id, mime?, filename?, alt? }` — not a
 * bare id, so admin renders show a thumbnail + filename without an
 * extra resolve round-trip per render. `referenceTarget.valueShape`
 * is `"object"`; the meta pipeline overwrites the cached fields
 * (mime/filename) from the lookup adapter on every write but lets
 * user-supplied keys (e.g. per-usage `alt`) survive the merge.
 *
 * Lives in core so the typed builder narrows correctly at call
 * sites — same convention as `entry` / `term`. The actual builder
 * + adapter are in `@plumix/plugin-media`.
 */
export interface MediaMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "media";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
}

/** Single-value dropdown picker; `options` is required. */
export interface SelectMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "select";
  readonly type: "string";
  readonly options: readonly MetaBoxFieldOption[];
}

/** Single-value radio group; `options` is required. */
export interface RadioMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "radio";
  readonly type: "string";
  readonly options: readonly MetaBoxFieldOption[];
}

/** Boolean checkbox — storage type pinned to `boolean`. */
export interface CheckboxMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "checkbox";
  readonly type: "boolean";
}

/**
 * Catch-all variant for any `inputType` not narrowed into a dedicated
 * variant above — primarily plugin-registered custom types arriving via
 * `registerFieldType`. Object-literal registrations using built-in
 * input-type strings (e.g. `inputType: "text"`) still type-check
 * against the narrowed variant when their option shape matches; this
 * variant exists so authoring patterns and plugin extensions don't
 * regress.
 */
export interface LegacyMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
}

/**
 * A field inside a meta box — the single source of truth for both the
 * admin UI renderer and the server-side storage contract. Declaring a
 * meta box is the only way to register a meta key; there is no separate
 * `registerMeta` step.
 *
 * Modelled as a discriminated union keyed on `inputType`. Each built-in
 * input type has its own narrowed variant produced by a builder helper
 * exported from `plumix/fields`; `LegacyMetaBoxField` keeps custom
 * `registerFieldType` registrations and broad object-literal authoring
 * compiling unchanged.
 */
export type MetaBoxField =
  | TextMetaBoxField
  | TextareaMetaBoxField
  | NumberMetaBoxField
  | EmailMetaBoxField
  | UrlMetaBoxField
  | PasswordMetaBoxField
  | DateMetaBoxField
  | DateTimeMetaBoxField
  | TimeMetaBoxField
  | ColorMetaBoxField
  | RangeMetaBoxField
  | MultiselectMetaBoxField
  | JsonMetaBoxField
  | UserMetaBoxField
  | UserListMetaBoxField
  | EntryReferenceMetaBoxField
  | EntryListMetaBoxField
  | TermReferenceMetaBoxField
  | TermListMetaBoxField
  | MediaMetaBoxField
  | SelectMetaBoxField
  | RadioMetaBoxField
  | CheckboxMetaBoxField
  | LegacyMetaBoxField;

/**
 * Shared base for every "card of fields" registration surface — entry
 * meta boxes, term meta boxes, user meta boxes, and settings groups.
 * Each concrete surface extends this with its scope specifier (if any)
 * and any surface-specific layout hints (`location` on entry boxes).
 *
 * Semantics shared across every extender:
 * - `priority` orders cards within their region; lower first,
 *   unspecified sorts last, ties break by `id` / `name` alphabetical.
 * - `capability` is a UI-only filter — the admin hides cards the
 *   viewer lacks the capability for. The server enforces only the
 *   entity-level write gate (`<entryType>:edit*`, `<termTaxonomy>:edit`,
 *   `user:edit`, `settings:manage`). Do NOT use `capability` for
 *   secrets; any user with the entity write gate can write any
 *   registered field via the raw RPC.
 * - `fields` carry `MetaBoxField.sanitize` which runs server-side only
 *   — the manifest wire contract strips callbacks before shipping.
 */
export interface MetaBoxBaseOptions {
  readonly label: string;
  readonly description?: string;
  readonly priority?: number;
  readonly capability?: string;
  readonly fields: readonly MetaBoxField[];
}

/**
 * Field shape for entry meta boxes. Drops `span` from the shared
 * `MetaBoxField` — the editor's document rail is a fixed 256px column,
 * so side-by-side layouts can't fit legibly. Compile-time signal to
 * plugin authors that spans are a page-width affordance only (term,
 * user, settings).
 *
 * `Omit<MetaBoxField, "span">` would normally distribute over the
 * union, but TS's excess-property check across a many-variant
 * distributed `Omit` gets pessimistic and starts rejecting options
 * that exist only on a subset of variants. The explicit per-variant
 * union below preserves the same shape with stable inference.
 */
export type EntryMetaBoxField =
  | Omit<TextMetaBoxField, "span">
  | Omit<TextareaMetaBoxField, "span">
  | Omit<NumberMetaBoxField, "span">
  | Omit<EmailMetaBoxField, "span">
  | Omit<UrlMetaBoxField, "span">
  | Omit<PasswordMetaBoxField, "span">
  | Omit<DateMetaBoxField, "span">
  | Omit<DateTimeMetaBoxField, "span">
  | Omit<TimeMetaBoxField, "span">
  | Omit<ColorMetaBoxField, "span">
  | Omit<RangeMetaBoxField, "span">
  | Omit<MultiselectMetaBoxField, "span">
  | Omit<JsonMetaBoxField, "span">
  | Omit<UserMetaBoxField, "span">
  | Omit<UserListMetaBoxField, "span">
  | Omit<EntryReferenceMetaBoxField, "span">
  | Omit<EntryListMetaBoxField, "span">
  | Omit<TermReferenceMetaBoxField, "span">
  | Omit<TermListMetaBoxField, "span">
  | Omit<MediaMetaBoxField, "span">
  | Omit<SelectMetaBoxField, "span">
  | Omit<RadioMetaBoxField, "span">
  | Omit<CheckboxMetaBoxField, "span">
  | Omit<LegacyMetaBoxField, "span">;

/**
 * Meta box shown on the entry editor. Scoped by `entryTypes`. Renders
 * as a collapsible section in the editor's document rail, which is
 * fixed at 256px — fields always occupy the full row.
 */
export interface EntryMetaBoxOptions extends Omit<
  MetaBoxBaseOptions,
  "fields"
> {
  /**
   * @deprecated The entry editor no longer partitions meta boxes by
   * location — every registered box renders as a collapsible section in
   * the right rail regardless of this flag. Declared for backward
   * compatibility with plugins that still set it; safe to remove from
   * new code.
   */
  readonly location?: "bottom" | "sidebar";
  readonly entryTypes: readonly string[];
  readonly fields: readonly EntryMetaBoxField[];
}

/** Meta box shown on the termTaxonomy term edit form. Scoped by `termTaxonomies`. */
export interface TermMetaBoxOptions extends MetaBoxBaseOptions {
  readonly termTaxonomies: readonly string[];
}

/**
 * Meta box shown on the user edit form. User meta is a flat keyspace
 * (no scope analogue to entry types or termTaxonomies), so the base shape
 * is everything an author needs.
 */
export type UserMetaBoxOptions = MetaBoxBaseOptions;

/**
 * A self-contained group of fields on a settings page — storage unit
 * AND visual unit. Each group gets its own Save button (independent
 * storage, unlike entity meta which rides the entity's single Save).
 * Surfaced via `registerSettingsPage.groups: string[]`.
 */
export type SettingsGroupOptions = MetaBoxBaseOptions;

/**
 * A UI-level composition of groups rendered at `/settings/<page>` in the
 * admin. Pages are not stored — they're pure registration metadata. A
 * page lists the groups it wants to surface by name (each group can be
 * referenced from multiple pages if useful).
 */
export interface SettingsPageOptions {
  readonly label: string;
  readonly description?: string;
  readonly groups: readonly string[];
  /**
   * Admin menu ordering. Unspecified positions sort last (in
   * registration order). Mirrors `EntryTypeOptions.priority` so
   * sidebar composition stays predictable across plugins.
   */
  readonly priority?: number;
}

export interface RegisteredEntryType extends EntryTypeOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredTermTaxonomy extends TermTaxonomyOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredEntryMetaBox extends EntryMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
}

export interface RegisteredTermMetaBox extends TermMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
}

export interface RegisteredUserMetaBox extends UserMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
}

export interface RegisteredSettingsGroup extends SettingsGroupOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredSettingsPage extends SettingsPageOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredCapability {
  readonly name: string;
  readonly minRole: UserRole;
  /**
   * Additional roles explicitly granted the capability, independent of
   * hierarchy. Complements `minRole`: a role satisfies the capability
   * if it meets `minRole` OR appears here. Useful for non-contiguous
   * grants ("editors and authors but not admins in between" stays
   * impossible; "admin by hierarchy + author explicitly" becomes
   * expressible). Sorted + deduped at registration.
   */
  readonly defaultGrants?: readonly UserRole[];
  readonly registeredBy: string | null;
}

export interface RegisteredRewriteRule {
  readonly pattern: string;
  readonly intent: RouteIntent;
  readonly priority: number;
  readonly registeredBy: string | null;
}

/**
 * Reference to a React component contributed by a plugin. The string is
 * the export name on the plugin's `adminEntry` module — the plumix vite
 * pipeline namespace-imports each plugin's entry and emits the matching
 * `window.plumix.registerPlugin{Page,Block,FieldType}` calls into the
 * synthesised admin chunk, so plugin authors only need `export const
 * MyComponent = ...` and a single registration call to `ctx.register*`.
 *
 * No `package` field is needed: the plugin id (implicit from
 * registration context) keys the namespace import the export resolves
 * against. Drop-in for the previous `{ package, export }` shape; bumped
 * pre-release so consumers can update in one pass.
 */
export type PluginComponentRef = string;

/**
 * How an admin page slots into the sidebar. `group` is either a bare
 * id (string) or an object that declares group metadata inline — first
 * page using a given id sets the label/priority for that group; later
 * pages can use the bare-string form to attach to it. Core group ids
 * (`overview` / `content` / `term-taxonomies` / `management`) carry
 * their own label/priority and ignore inline metadata.
 */
export type AdminNavGroupRef =
  | string
  | {
      readonly id: string;
      readonly label?: string;
      readonly priority?: number;
    };

export interface AdminPageOptions {
  readonly path: string;
  readonly title: string;
  readonly nav?: {
    readonly group: AdminNavGroupRef;
    readonly label: string;
    readonly icon?: PluginComponentRef;
    readonly order?: number;
  };
  readonly capability?: string;
  readonly component: PluginComponentRef;
}

export interface RegisteredAdminPage extends AdminPageOptions {
  readonly registeredBy: string | null;
}

/**
 * Built-in nav-icon names that core nav items reference. The admin maps
 * each value to a lucide component at render time — keeps the wire
 * payload free of package identifiers and makes the union exhaustive at
 * the type level.
 */
export type CoreIconName =
  | "dashboard"
  | "content"
  | "file-text"
  | "layout"
  | "image"
  | "calendar"
  | "tag"
  | "folder"
  | "users"
  | "settings"
  | "puzzle"
  | "mail"
  | "key";

// Subset of `CoreIconName` plugins may emit on `EntryTypeOptions.menuIcon`
// or `TermTaxonomyOptions.menuIcon`. Names outside this set fall back to
// a sensible default at projection time.
const ENTRY_MENU_ICONS: ReadonlySet<CoreIconName> = new Set<CoreIconName>([
  "content",
  "file-text",
  "layout",
  "image",
  "calendar",
]);
const TAXONOMY_MENU_ICONS: ReadonlySet<CoreIconName> = new Set<CoreIconName>([
  "tag",
  "folder",
]);

/**
 * Built-in nav groups core ships. Plugins target their items at these
 * ids via `nav.group`, and can interleave their own groups by picking
 * priorities between or around these defaults.
 */
export const CORE_NAV_GROUPS: readonly {
  readonly id: string;
  readonly label: string;
  readonly priority: number;
}[] = [
  { id: "overview", label: "Overview", priority: 0 },
  { id: "content", label: "Entries", priority: 100 },
  { id: "term-taxonomies", label: "Taxonomies", priority: 200 },
  { id: "management", label: "Management", priority: 1000 },
];

export interface BlockOptions {
  readonly name: string;
  readonly kind: "node" | "mark";
  /** Opaque Tiptap spec passed to `Node.create` / `Mark.create`. */
  readonly schema: Readonly<Record<string, unknown>>;
  readonly component?: PluginComponentRef;
}

/**
 * Plugin-contributed form field renderer. The admin's form dispatcher
 * falls through to a plain text input on unknown `inputType` values
 * (with a dev-mode warning); registering a type here swaps in a
 * plugin React component that renders the custom UI.
 *
 * The `type` string must match a field's `inputType` — registering
 * `type: "media_picker"` means any field (entry meta, term meta,
 * user meta, settings group) with `inputType: "media_picker"`
 * renders through the plugin's component.
 */
export interface FieldTypeOptions {
  readonly type: string;
  readonly component: PluginComponentRef;
}

export interface RegisteredBlock extends BlockOptions {
  readonly registeredBy: string | null;
}

export interface RegisteredFieldType extends FieldTypeOptions {
  readonly registeredBy: string | null;
}

export type PluginRouteMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "*";

export type PluginRouteAuth =
  | "public"
  | "authenticated"
  | { readonly capability: string };

export interface RegisteredRawRoute {
  readonly pluginId: string;
  readonly method: PluginRouteMethod;
  readonly path: string;
  readonly auth: PluginRouteAuth;
  readonly handler: (
    request: Request,
    ctx: AppContext,
  ) => Response | Promise<Response>;
}

/**
 * Tiny `{ key, label, href }` blob a plugin attaches so the standard
 * login screen can render a button for the sign-in flow it ships. The
 * actual flow (start route, callback route, identity resolution) is
 * registered separately via `registerRoute` + `resolveExternalIdentity`;
 * this is purely the UI affordance that points the user at it.
 */
export interface LoginLinkOptions {
  /**
   * Stable key, scoped per-plugin. The wire id surfaced to the admin
   * (and used as its React key) is `${pluginId}:${key}`, so the bare
   * `key` you pass only needs to be unique within your own plugin —
   * two different plugins can both register a `key: "default"`.
   *
   * Lowercase alphanum + dash/underscore, must start with a letter,
   * 1–32 chars total. Same shape as `OAUTH_PROVIDER_KEY_PATTERN`.
   */
  readonly key: string;
  /**
   * Button text shown on the login screen ("Sign in with Microsoft",
   * "Continue with Okta"). No CR/LF — see `siteName` for rationale.
   */
  readonly label: string;
  /**
   * URL the button points at — typically the plugin's own start route,
   * e.g. `/_plumix/saml-microsoft/start`. Must be a relative path
   * starting with `/` or an `https://` absolute URL; arbitrary schemes
   * are rejected so a malicious or misconfigured plugin can't surface
   * a `javascript:` link.
   */
  readonly href: string;
}

export interface RegisteredLoginLink extends LoginLinkOptions {
  readonly registeredBy: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginRpcRouter = Record<string, any>;

export const CORE_RPC_NAMESPACES: ReadonlySet<string> = new Set([
  "auth",
  "entry",
  "term",
  "user",
  "lookup",
  "settings",
]);

export interface PluginRegistry {
  readonly entryTypes: ReadonlyMap<string, RegisteredEntryType>;
  readonly termTaxonomies: ReadonlyMap<string, RegisteredTermTaxonomy>;
  readonly entryMetaBoxes: ReadonlyMap<string, RegisteredEntryMetaBox>;
  readonly termMetaBoxes: ReadonlyMap<string, RegisteredTermMetaBox>;
  readonly userMetaBoxes: ReadonlyMap<string, RegisteredUserMetaBox>;
  readonly capabilities: ReadonlyMap<string, RegisteredCapability>;
  readonly settingsGroups: ReadonlyMap<string, RegisteredSettingsGroup>;
  readonly settingsPages: ReadonlyMap<string, RegisteredSettingsPage>;
  readonly rewriteRules: readonly RegisteredRewriteRule[];
  readonly rpcRouters: ReadonlyMap<string, PluginRpcRouter>;
  readonly rawRoutes: readonly RegisteredRawRoute[];
  readonly loginLinks: readonly RegisteredLoginLink[];
  readonly adminPages: ReadonlyMap<string, RegisteredAdminPage>;
  readonly blocks: ReadonlyMap<string, RegisteredBlock>;
  readonly fieldTypes: ReadonlyMap<string, RegisteredFieldType>;
  readonly lookupAdapters: ReadonlyMap<string, RegisteredLookupAdapter>;
}

export interface MutablePluginRegistry extends PluginRegistry {
  readonly entryTypes: Map<string, RegisteredEntryType>;
  readonly termTaxonomies: Map<string, RegisteredTermTaxonomy>;
  readonly entryMetaBoxes: Map<string, RegisteredEntryMetaBox>;
  readonly termMetaBoxes: Map<string, RegisteredTermMetaBox>;
  readonly userMetaBoxes: Map<string, RegisteredUserMetaBox>;
  readonly capabilities: Map<string, RegisteredCapability>;
  readonly settingsGroups: Map<string, RegisteredSettingsGroup>;
  readonly settingsPages: Map<string, RegisteredSettingsPage>;
  readonly rewriteRules: RegisteredRewriteRule[];
  readonly rpcRouters: Map<string, PluginRpcRouter>;
  readonly rawRoutes: RegisteredRawRoute[];
  readonly loginLinks: RegisteredLoginLink[];
  readonly adminPages: Map<string, RegisteredAdminPage>;
  readonly blocks: Map<string, RegisteredBlock>;
  readonly fieldTypes: Map<string, RegisteredFieldType>;
  readonly lookupAdapters: Map<string, RegisteredLookupAdapter>;
}

export function createPluginRegistry(): MutablePluginRegistry {
  return {
    entryTypes: new Map(),
    termTaxonomies: new Map(),
    entryMetaBoxes: new Map(),
    termMetaBoxes: new Map(),
    userMetaBoxes: new Map(),
    capabilities: new Map(),
    settingsGroups: new Map(),
    settingsPages: new Map(),
    rewriteRules: [],
    rpcRouters: new Map(),
    rawRoutes: [],
    loginLinks: [],
    adminPages: new Map(),
    blocks: new Map(),
    fieldTypes: new Map(),
    lookupAdapters: new Map(),
  };
}

/**
 * Look up the `MetaBoxField` declaration for a meta key within the
 * entry meta surface, scoped to a given entry type. Returns the first
 * matching field across all registered entry meta boxes — key
 * uniqueness per (entryType, key) is enforced at registration time,
 * so "first match" is the only match.
 */
export function findEntryMetaField(
  registry: PluginRegistry,
  entryType: string,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.entryMetaBoxes.values()) {
    if (!box.entryTypes.includes(entryType)) continue;
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

/**
 * Like `findEntryMetaField`, but for term meta. Scoped by termTaxonomy.
 */
export function findTermMetaField(
  registry: PluginRegistry,
  termTaxonomy: string,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.termMetaBoxes.values()) {
    if (!box.termTaxonomies.includes(termTaxonomy)) continue;
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

/**
 * Like `findEntryMetaField`, but for user meta. Users have a flat
 * keyspace (no entry-type / termTaxonomy analogue), so no scope argument —
 * key uniqueness across all user meta boxes is enforced at manifest-
 * build time.
 */
export function findUserMetaField(
  registry: PluginRegistry,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.userMetaBoxes.values()) {
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

export class DuplicateRegistrationError extends Error {
  constructor(kind: string, name: string) {
    super(`${kind} "${name}" is already registered`);
    this.name = "DuplicateRegistrationError";
  }
}

/**
 * Shape serialised into the admin's `<script id="plumix-manifest">` payload.
 * Intentionally a strict subset of `RegisteredEntryType`: drops
 * `registeredBy` (plugin attribution is server-only debug metadata) and
 * `rewrite` (URL mapping is evaluated server-side). Add fields only when the
 * admin UI needs them.
 *
 * `adminSlug` is derived at build time (see `buildManifest`) and is what the
 * admin router uses for `/entries/$slug`. Keeping it in the manifest rather
 * than re-deriving client-side lets the collision check run once on the
 * server and ships the final routing key as authoritative.
 */
export interface EntryTypeManifestEntry {
  readonly name: string;
  readonly adminSlug: string;
  readonly label: string;
  readonly labels?: {
    readonly singular?: string;
    readonly plural?: string;
  };
  readonly description?: string;
  readonly supports?: readonly string[];
  readonly termTaxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  /**
   * Resolved visibility. `buildManifest` always emits these — consumers
   * should read them via `manifestEntryVisibility(entry)` which applies
   * the same cascade rules as `resolveEntryTypeVisibility` when they
   * happen to be missing (lets admin test fixtures stay terse without
   * the client ever branching on undefined).
   */
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly hasArchive?: boolean | string;
  readonly capabilityType?: string;
  readonly priority?: number;
  readonly menuIcon?: string;
}

/**
 * Client-safe field descriptor inside a meta box. Mirrors `MetaBoxField`
 * minus the server-only `sanitize` callback and `default` value (the
 * admin receives the default server-side and injects it into the form).
 */
export interface MetaBoxFieldManifestEntry {
  readonly key: string;
  readonly label: string;
  readonly type: MetaScalarType;
  readonly inputType: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly maxLength?: number;
  /**
   * Lower bound. `number` carries it as a number; `date` / `datetime`
   * / `time` carry it as the matching ISO string. Renderers branch on
   * `inputType` to pick the right interpretation.
   */
  readonly min?: number | string;
  /** Upper bound — see `min`. */
  readonly max?: number | string;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
  readonly default?: unknown;
  readonly span?: MetaBoxFieldSpan;
  /**
   * Carried for reference field variants (`user`, `entry`, `term`,
   * `media`, plugin-registered kinds). The admin's generic picker
   * dispatches on `referenceTarget.kind` to call the matching
   * lookup RPC; `scope` rides along untouched.
   */
  readonly referenceTarget?: ReferenceTarget;
}

/**
 * Shared base for every "card of fields" serialised entry. Each
 * concrete projection extends with its identifier + any surface-
 * specific layout + scope fields.
 */
export interface MetaBoxBaseManifestEntry {
  readonly label: string;
  readonly description?: string;
  readonly priority?: number;
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/**
 * Wire-side mirror of `EntryMetaBoxField` — drops `span` from the
 * shared `MetaBoxFieldManifestEntry`. See `EntryMetaBoxField` for why.
 */
export type EntryMetaBoxFieldManifestEntry = Omit<
  MetaBoxFieldManifestEntry,
  "span"
>;

export interface EntryMetaBoxManifestEntry extends Omit<
  MetaBoxBaseManifestEntry,
  "fields"
> {
  readonly id: string;
  /**
   * @deprecated Ignored by the admin editor — all entry meta boxes
   * render in the document rail as collapsible sections. Kept on the
   * wire so older plugins that set it don't fail manifest validation.
   */
  readonly location?: "bottom" | "sidebar";
  readonly entryTypes: readonly string[];
  readonly fields: readonly EntryMetaBoxFieldManifestEntry[];
}

export interface TermMetaBoxManifestEntry extends MetaBoxBaseManifestEntry {
  readonly id: string;
  readonly termTaxonomies: readonly string[];
}

export interface UserMetaBoxManifestEntry extends MetaBoxBaseManifestEntry {
  readonly id: string;
}

/**
 * Shape serialised for termTaxonomies in the manifest. Strict allowlist
 * projection of `RegisteredTermTaxonomy` — drops `registeredBy` (server-only
 * debug metadata) and server-only operational flags (`isInQuickEdit`,
 * `hasAdminColumn`, `rewrite`) that don't affect the admin UI today.
 * `entryTypes` is kept so future admin surfaces (term-picker on post
 * editor) can filter by post type without a second round-trip.
 */
export interface TermTaxonomyManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly labels?: { readonly singular?: string };
  readonly description?: string;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
  /** Resolved visibility — see `EntryTypeManifestEntry`. */
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly menuIcon?: string;
}

/**
 * Shape serialised for settings groups in the manifest. Same shared
 * shape as every other meta surface; the storage key `name` replaces
 * the meta-box `id`. Fields use the same `MetaBoxFieldManifestEntry`
 * type — one field contract for plugin authors.
 */
export interface SettingsGroupManifestEntry extends MetaBoxBaseManifestEntry {
  readonly name: string;
}

/**
 * Shape serialised for settings pages in the manifest. Pages are pure
 * admin-UI composition: `groups` names registered groups in render
 * order, one shadcn `<Card>` per group in the admin route.
 */
export interface SettingsPageManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly groups: readonly string[];
  readonly priority?: number;
}

/**
 * One row in the assembled admin sidebar tree. Sources contributing
 * items: core (Dashboard, Users, Settings), entry types (auto-projected
 * to the `content` group), term taxonomies (auto-projected to the
 * `term-taxonomies` group), and plugin-registered admin pages with
 * `nav` set.
 *
 * Exactly one of `icon` (plugin-supplied React component ref) or
 * `coreIcon` (built-in lucide name) is set per item; admin picks a
 * generic fallback when neither is provided.
 *
 * `component` is set only for plugin-rendered routes — the admin's
 * `/p/$` catch-all looks up this ref to render the page. Items that
 * point at core admin routes (`/`, `/users`, `/settings`,
 * `/entries/<slug>`, etc.) leave it undefined.
 */
export interface AdminNavItem {
  readonly to: string;
  readonly label: string;
  readonly order?: number;
  readonly capability?: string;
  readonly icon?: PluginComponentRef;
  readonly coreIcon?: CoreIconName;
  readonly component?: PluginComponentRef;
  readonly exact?: boolean;
}

export interface AdminNavGroup {
  readonly id: string;
  readonly label: string;
  readonly priority?: number;
  readonly icon?: PluginComponentRef;
  readonly coreIcon?: CoreIconName;
  readonly items: readonly AdminNavItem[];
}

export interface BlockManifestEntry {
  readonly name: string;
  readonly kind: "node" | "mark";
  readonly schema: Readonly<Record<string, unknown>>;
  readonly component?: PluginComponentRef;
}

export interface FieldTypeManifestEntry {
  readonly type: string;
  readonly component: PluginComponentRef;
}

/**
 * Wire-shipped manifest payload. Every field is optional on the type
 * so test fixtures can declare just the slice they exercise; the
 * server's `buildManifest` always populates all of them and consumers
 * coerce missing fields to `[]` at the read site.
 */
export interface PlumixManifest {
  readonly entryTypes?: readonly EntryTypeManifestEntry[];
  readonly termTaxonomies?: readonly TermTaxonomyManifestEntry[];
  readonly entryMetaBoxes?: readonly EntryMetaBoxManifestEntry[];
  readonly termMetaBoxes?: readonly TermMetaBoxManifestEntry[];
  readonly userMetaBoxes?: readonly UserMetaBoxManifestEntry[];
  readonly settingsGroups?: readonly SettingsGroupManifestEntry[];
  readonly settingsPages?: readonly SettingsPageManifestEntry[];
  readonly adminNav?: readonly AdminNavGroup[];
  readonly blocks?: readonly BlockManifestEntry[];
  readonly fieldTypes?: readonly FieldTypeManifestEntry[];
}

/**
 * Strict manifest shape — every slice is populated. `buildManifest`
 * returns this; tests reading from it don't need `?.` everywhere. The
 * wider `PlumixManifest` (all-optional) is what flows over the wire
 * and what test fixtures construct.
 */
export type BuiltManifest = {
  readonly [K in keyof PlumixManifest]-?: NonNullable<PlumixManifest[K]>;
};

/** Script tag id that carries the JSON-encoded manifest in the admin HTML. */
export const MANIFEST_SCRIPT_ID = "plumix-manifest";

export function emptyManifest(): PlumixManifest {
  return {
    entryTypes: [],
    termTaxonomies: [],
    entryMetaBoxes: [],
    termMetaBoxes: [],
    userMetaBoxes: [],
    settingsGroups: [],
    settingsPages: [],
    adminNav: [],
    blocks: [],
    fieldTypes: [],
  };
}

/**
 * Project a registry snapshot into its manifest form — the subset that ships
 * to the admin bundle. Every surface with a `priority?: number` field —
 * entry types, entry/term/user meta boxes, settings pages, settings groups —
 * is sorted by `priority` ascending; ties break by `name` / `id`
 * alphabetical so the shipped order is deterministic regardless of
 * plugin install order.
 *
 * Throws `DuplicateAdminSlugError` if two post types resolve to the same
 * admin slug — the admin router can't disambiguate `/entries/$slug` in that
 * case, and catching it at build time is cheaper than a 404 at runtime.
 */
export function buildManifest(registry: PluginRegistry): BuiltManifest {
  const entries = Array.from(registry.entryTypes.values())
    .map(toEntryTypeManifest)
    .sort(byPriorityThen((e) => e.name));
  assertUniqueAdminSlugs(entries);
  const termTaxonomies = Array.from(registry.termTaxonomies.values()).map(
    toTermTaxonomyEntry,
  );
  const entryMetaBoxes = Array.from(registry.entryMetaBoxes.values())
    .map(toEntryMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  const termMetaBoxes = Array.from(registry.termMetaBoxes.values())
    .map(toTermMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  const userMetaBoxes = Array.from(registry.userMetaBoxes.values())
    .map(toUserMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  assertMetaBoxScopesExist(
    entryMetaBoxes,
    (box) => box.entryTypes,
    new Set(entries.map((e) => e.name)),
    "entry meta box",
    "entry type",
  );
  assertMetaBoxScopesExist(
    termMetaBoxes,
    (box) => box.termTaxonomies,
    new Set(termTaxonomies.map((t) => t.name)),
    "term meta box",
    "termTaxonomy",
  );
  assertUniqueFieldKeysPerScope(
    entryMetaBoxes,
    (box) => box.entryTypes,
    "entry",
  );
  assertUniqueFieldKeysPerScope(
    termMetaBoxes,
    (box) => box.termTaxonomies,
    "term",
  );
  // User meta is a flat keyspace — one synthetic "user" scope keeps
  // the shared helper honest without inventing a second code path.
  assertUniqueFieldKeysPerScope(userMetaBoxes, getUserScope, "user");
  const settingsGroups = Array.from(registry.settingsGroups.values())
    .map(toSettingsGroupEntry)
    .sort(byPriorityThen((g) => g.name));
  const settingsPages = Array.from(registry.settingsPages.values())
    .map(toSettingsPageEntry)
    .sort(byPriorityThen((p) => p.name));
  assertSettingsPageGroupsExist(settingsPages, registry.settingsGroups);
  const adminNav = projectAdminNav(registry, entries, termTaxonomies);
  const blocks = Array.from(registry.blocks.values())
    .map(toBlockEntry)
    .sort((a, b) => a.name.localeCompare(b.name));
  const fieldTypes = Array.from(registry.fieldTypes.values())
    .map(toFieldTypeEntry)
    .sort((a, b) => a.type.localeCompare(b.type));
  return {
    entryTypes: entries,
    termTaxonomies,
    entryMetaBoxes,
    termMetaBoxes,
    userMetaBoxes,
    settingsGroups,
    settingsPages,
    adminNav,
    blocks,
    fieldTypes,
  };
}

interface MutableAdminNavGroup {
  id: string;
  label: string;
  priority?: number;
  icon?: PluginComponentRef;
  coreIcon?: CoreIconName;
  items: AdminNavItem[];
}

// Built-in items core seeds into the projection. Each row is keyed by
// the group id it lands in; capability gating is admin-side at render
// time (the manifest projection ships every item, the sidebar drops
// what the user can't see).
const CORE_NAV_ITEMS: readonly { groupId: string; item: AdminNavItem }[] = [
  {
    groupId: "overview",
    item: {
      to: "/",
      label: "Dashboard",
      coreIcon: "dashboard",
      order: 0,
      exact: true,
    },
  },
  {
    groupId: "management",
    item: {
      to: "/users",
      label: "Users",
      coreIcon: "users",
      order: 100,
      capability: "user:list",
    },
  },
  {
    groupId: "management",
    item: {
      to: "/allowed-domains",
      label: "Allowed domains",
      coreIcon: "users",
      order: 150,
      capability: "settings:manage",
    },
  },
  {
    groupId: "management",
    item: {
      to: "/mailer",
      label: "Mailer",
      coreIcon: "mail",
      order: 175,
      capability: "settings:manage",
    },
  },
  {
    groupId: "management",
    item: {
      to: "/settings",
      label: "Settings",
      coreIcon: "settings",
      order: 200,
      capability: "settings:manage",
    },
  },
];

// Default priority for plugin-declared custom groups — sits between
// `term-taxonomies` (200) and `management` (1000). Plugin authors who
// need a different position pass `priority` in the inline group form
// on `registerAdminPage`.
const CUSTOM_NAV_GROUP_PRIORITY = 500;

// Title-case a kebab/snake id when a plugin doesn't declare a label
// inline. `appearance` → `Appearance`, `my-custom-group` → `My custom
// group`. Plugins can override by passing the rich group form.
function humanizeGroupId(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return id;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function seedNavGroups(): Map<string, MutableAdminNavGroup> {
  const groups = new Map<string, MutableAdminNavGroup>();
  for (const g of CORE_NAV_GROUPS) {
    groups.set(g.id, {
      id: g.id,
      label: g.label,
      priority: g.priority,
      items: [],
    });
  }
  for (const { groupId, item } of CORE_NAV_ITEMS) {
    groups.get(groupId)?.items.push(item);
  }
  return groups;
}

function addEntryNavItems(
  groups: Map<string, MutableAdminNavGroup>,
  entries: readonly EntryTypeManifestEntry[],
): void {
  for (const entry of entries) {
    if (entry.showInSidebar !== true) continue;
    groups.get("content")?.items.push({
      to: `/entries/${entry.adminSlug}`,
      label: entry.labels?.plural ?? entry.label,
      order: entry.priority,
      coreIcon: resolveEntryMenuIcon(entry.menuIcon),
      capability: `entry:${entry.capabilityType ?? entry.name}:edit_own`,
    });
  }
}

function addTaxonomyNavItems(
  groups: Map<string, MutableAdminNavGroup>,
  taxonomies: readonly TermTaxonomyManifestEntry[],
): void {
  for (const tax of taxonomies) {
    if (tax.showInSidebar !== true) continue;
    groups.get("term-taxonomies")?.items.push({
      to: `/terms/${tax.name}`,
      label: tax.label,
      coreIcon: resolveTaxonomyMenuIcon(tax.menuIcon, tax.isHierarchical),
      capability: `term:${tax.name}:read`,
    });
  }
}

function ensureNavGroup(
  groups: Map<string, MutableAdminNavGroup>,
  groupRef: string | { id: string; label?: string; priority?: number },
): MutableAdminNavGroup {
  const groupId = typeof groupRef === "string" ? groupRef : groupRef.id;
  const existing = groups.get(groupId);
  if (existing) return existing;
  // Custom group, first occurrence — derive metadata from the inline
  // form when present, else humanize the id.
  const meta = typeof groupRef === "object" ? groupRef : null;
  const created: MutableAdminNavGroup = {
    id: groupId,
    label: meta?.label ?? humanizeGroupId(groupId),
    priority: meta?.priority ?? CUSTOM_NAV_GROUP_PRIORITY,
    items: [],
  };
  groups.set(groupId, created);
  return created;
}

function addAdminPageNavItems(
  groups: Map<string, MutableAdminNavGroup>,
  registry: PluginRegistry,
): void {
  for (const page of registry.adminPages.values()) {
    if (!page.nav) continue;
    ensureNavGroup(groups, page.nav.group).items.push({
      to: `/pages${page.path}`,
      label: page.nav.label,
      order: page.nav.order,
      icon: page.nav.icon,
      coreIcon: page.nav.icon ? undefined : "puzzle",
      component: page.component,
      capability: page.capability,
    });
  }
}

function compareByOrderThenLabel(
  a: { order?: number; label: string },
  b: { order?: number; label: string },
): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  return ao - bo || a.label.localeCompare(b.label);
}

function compareByPriorityThenId(
  a: { priority?: number; id: string },
  b: { priority?: number; id: string },
): number {
  const ap = a.priority ?? Number.POSITIVE_INFINITY;
  const bp = b.priority ?? Number.POSITIVE_INFINITY;
  return ap - bp || a.id.localeCompare(b.id);
}

function projectAdminNav(
  registry: PluginRegistry,
  entries: readonly EntryTypeManifestEntry[],
  termTaxonomies: readonly TermTaxonomyManifestEntry[],
): readonly AdminNavGroup[] {
  const groups = seedNavGroups();
  addEntryNavItems(groups, entries);
  addTaxonomyNavItems(groups, termTaxonomies);
  addAdminPageNavItems(groups, registry);

  return Array.from(groups.values())
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      ...g,
      items: g.items.slice().sort(compareByOrderThenLabel),
    }))
    .sort(compareByPriorityThenId);
}

/**
 * Shared comparator: `priority` ascending (unspecified sorts last),
 * ties broken by a caller-supplied stable key (id / name) in
 * alphabetical order. Used by `buildManifest` server-side AND the
 * admin's in-memory filter helpers so the shipped manifest and the
 * admin filter paths agree on order regardless of registration
 * sequence.
 */
export function byPriorityThen<T extends { readonly priority?: number }>(
  getKey: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const ap = a.priority ?? Number.POSITIVE_INFINITY;
    const bp = b.priority ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return getKey(a).localeCompare(getKey(b));
  };
}

/**
 * Seed per-field values from a server meta bag, falling back to each
 * field's registered `default`. Shared by every admin form that owns
 * meta state (entry editor, term edit route, user edit route, settings
 * group card) — one shape, one behaviour.
 */
export function seedFromMetaBoxes(
  boxes: readonly {
    readonly fields: readonly {
      readonly key: string;
      readonly default?: unknown;
    }[];
  }[],
  stored: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
  const bag = stored ?? {};
  const seed: Record<string, unknown> = {};
  for (const box of boxes) {
    for (const field of box.fields) {
      seed[field.key] = bag[field.key] ?? field.default;
    }
  }
  return seed;
}

// Synthetic flat-keyspace scope for user meta. Hoisted so the
// `assertUniqueFieldKeysPerScope` callback doesn't re-allocate per
// buildManifest call.
const USER_SCOPE = ["user"] as const;
const getUserScope = (): readonly string[] => USER_SCOPE;

/**
 * Two meta boxes on the same `(scope, field.key)` pair would silently
 * write to the same storage key — a plugin-author footgun. Fail loudly
 * at manifest-build time. `scope` is the entry type (for entry boxes)
 * or termTaxonomy (for term boxes); user boxes collapse to one synthetic
 * scope because the user keyspace is flat.
 */
function assertUniqueFieldKeysPerScope<
  TBox extends {
    readonly id: string;
    readonly fields: readonly MetaBoxFieldManifestEntry[];
  },
>(
  boxes: readonly TBox[],
  getScopes: (box: TBox) => readonly string[],
  kind: "entry" | "term" | "user",
): void {
  const seen = new Map<string, string>();
  for (const box of boxes) {
    for (const scope of getScopes(box)) {
      for (const field of box.fields) {
        const scopedKey = `${scope}:${field.key}`;
        const existing = seen.get(scopedKey);
        if (existing !== undefined && existing !== box.id) {
          throw new Error(
            `Meta field "${field.key}" is declared by ${kind} meta ` +
              `boxes "${existing}" and "${box.id}" on the same scope ` +
              `"${scope}". Each key may appear in at most one box ` +
              `per scope.`,
          );
        }
        seen.set(scopedKey, box.id);
      }
    }
  }
}

// A meta box referencing an unregistered scope ("catagory" typo, a
// termTaxonomy removed behind the plugin's back, etc.) is dead code — the
// box never renders and never writes. Fail at manifest build so the
// plugin author sees it on boot, not at first admin click. Matches the
// settings-page→group reference check.
function assertMetaBoxScopesExist<TBox extends { readonly id: string }>(
  boxes: readonly TBox[],
  getScopes: (box: TBox) => readonly string[],
  known: ReadonlySet<string>,
  boxKind: string,
  scopeKind: string,
): void {
  for (const box of boxes) {
    for (const scope of getScopes(box)) {
      if (!known.has(scope)) {
        throw new Error(
          `${boxKind} "${box.id}" references ${scopeKind} "${scope}" ` +
            `which hasn't been registered.`,
        );
      }
    }
  }
}

// Surfacing a clear error at manifest-build time beats a runtime
// "unknown group" in the admin route. Pages reference groups by name;
// if a group name doesn't resolve, the plugin author has a typo or
// order-of-registration problem.
function assertSettingsPageGroupsExist(
  pages: readonly SettingsPageManifestEntry[],
  groups: ReadonlyMap<string, RegisteredSettingsGroup>,
): void {
  for (const page of pages) {
    for (const groupName of page.groups) {
      if (!groups.has(groupName)) {
        throw new Error(
          `Settings page "${page.name}" references group "${groupName}" ` +
            `which hasn't been registered. Call ` +
            `ctx.registerSettingsGroup("${groupName}", {...}) before the page.`,
        );
      }
    }
  }
}

function assertUniqueAdminSlugs(
  entries: readonly EntryTypeManifestEntry[],
): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const existing = seen.get(entry.adminSlug);
    if (existing !== undefined) {
      throw new DuplicateAdminSlugError(existing, entry.name, entry.adminSlug);
    }
    seen.set(entry.adminSlug, entry.name);
  }
}

export class DuplicateAdminSlugError extends Error {
  constructor(firstPostType: string, secondPostType: string, slug: string) {
    super(
      `Entry types "${firstPostType}" and "${secondPostType}" both resolve ` +
        `to the admin slug "${slug}". Set \`labels.plural\` on one of them ` +
        `to disambiguate.`,
    );
    this.name = "DuplicateAdminSlugError";
  }
}

/**
 * Derive the URL-safe admin slug for a post type. Prefers `plural` when
 * set (allows "fish" → `fish`, "children" → `children`, etc.), falls back
 * to `${name}s` which is English-biased but matches the common case.
 * Non-alphanumerics collapse to single dashes; leading/trailing dashes
 * are trimmed. Empty results throw — an empty slug would shadow
 * `/entries/` itself in TanStack Router.
 */
export function deriveAdminSlug(name: string, plural?: string): string {
  const source = plural ?? `${name}s`;
  const slug = slugify(source);
  if (slug.length === 0) {
    const from = plural === undefined ? "its name" : `plural="${plural}"`;
    throw new Error(
      `Cannot derive an admin slug for post type "${name}" from ${from} — result was empty.`,
    );
  }
  return slug;
}

// Hand-rolled single-pass slugifier rather than chained `.replace()` calls.
// The regex form (`/[^a-z0-9]+/g` plus a trim) trips CodeQL's polynomial-
// regex detector on library-exposed inputs; this loop is provably O(n),
// regex-free, and produces the same output: lowercase ASCII alphanumerics
// separated by single dashes, no leading/trailing dashes.
function slugify(input: string): string {
  const lower = input.toLowerCase();
  let result = "";
  let pendingDash = false;
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    const isAlphaNum =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAlphaNum) {
      if (pendingDash && result.length > 0) result += "-";
      result += lower[i];
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return result;
}

// Explicit allowlist — only the destructured keys ship to the browser.
// Adding a field to `EntryTypeOptions` / `RegisteredEntryType` does NOT
// automatically leak it; it must be added here AND to `EntryTypeManifestEntry`
// to surface in the admin. `registeredBy`, `rewrite`, `capabilities`, and
// the raw per-surface visibility inputs are intentionally excluded — the
// resolved `isPublic` / `showUI` / `showInSidebar` triple is what the
// admin consumes, and `capabilities` is server-side authorization metadata.
function toEntryTypeManifest(pt: RegisteredEntryType): EntryTypeManifestEntry {
  const {
    name,
    label,
    labels,
    description,
    supports,
    termTaxonomies,
    isHierarchical,
    hasArchive,
    capabilityType,
    priority,
    menuIcon,
  } = pt;
  const visibility = resolveEntryTypeVisibility(pt);
  return {
    name,
    adminSlug: deriveAdminSlug(name, labels?.plural),
    label,
    labels,
    description,
    supports,
    termTaxonomies,
    isHierarchical,
    isPublic: visibility.isPublic,
    showUI: visibility.showUI,
    showInSidebar: visibility.showInSidebar,
    hasArchive,
    capabilityType,
    priority,
    menuIcon,
  };
}

// Allowlist for termTaxonomy entries — same rationale as `toEntryTypeManifest`.
// `registeredBy`, `capabilities`, `isInQuickEdit`, `hasAdminColumn`, and
// `rewrite` stay server-side. Visibility is projected via the resolver so
// the admin sees the same resolved triple as for entry types.
function toTermTaxonomyEntry(
  tax: RegisteredTermTaxonomy,
): TermTaxonomyManifestEntry {
  const {
    name,
    label,
    labels,
    description,
    isHierarchical,
    entryTypes,
    menuIcon,
  } = tax;
  const visibility = resolveTermTaxonomyVisibility(tax);
  return {
    name,
    label,
    labels,
    description,
    isHierarchical,
    entryTypes,
    isPublic: visibility.isPublic,
    showUI: visibility.showUI,
    showInSidebar: visibility.showInSidebar,
    menuIcon,
  };
}

function resolveEntryMenuIcon(menuIcon: string | undefined): CoreIconName {
  if (
    menuIcon !== undefined &&
    ENTRY_MENU_ICONS.has(menuIcon as CoreIconName)
  ) {
    return menuIcon as CoreIconName;
  }
  return "content";
}

function resolveTaxonomyMenuIcon(
  menuIcon: string | undefined,
  isHierarchical: boolean | undefined,
): CoreIconName {
  if (
    menuIcon !== undefined &&
    TAXONOMY_MENU_ICONS.has(menuIcon as CoreIconName)
  ) {
    return menuIcon as CoreIconName;
  }
  return isHierarchical === true ? "folder" : "tag";
}

// Allowlist for entry meta box entries — same rationale as
// `toEntryTypeManifest`. `registeredBy` is intentionally excluded
// (server-only debug metadata). `sanitize` on each field is stripped
// via `toEntryMetaBoxFieldEntry` — it's a server-side callback. `span`
// is also stripped: the editor rail renders every entry field at full
// width, and shipping a hint the renderer ignores just bloats the wire.
function toEntryMetaBoxEntry(
  box: RegisteredEntryMetaBox,
): EntryMetaBoxManifestEntry {
  const {
    id,
    label,
    description,
    location,
    priority,
    entryTypes,
    capability,
    fields,
  } = box;
  return {
    id,
    label,
    description,
    location,
    priority,
    entryTypes,
    capability,
    fields: fields.map(toEntryMetaBoxFieldEntry),
  };
}

// Term meta boxes are always stacked top-to-bottom on the termTaxonomy
// edit form — no `location` hint applies.
function toTermMetaBoxEntry(
  box: RegisteredTermMetaBox,
): TermMetaBoxManifestEntry {
  const {
    id,
    label,
    description,
    priority,
    termTaxonomies,
    capability,
    fields,
  } = box;
  return {
    id,
    label,
    description,
    priority,
    termTaxonomies,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// User meta boxes are stacked like term boxes — no scope / location.
function toUserMetaBoxEntry(
  box: RegisteredUserMetaBox,
): UserMetaBoxManifestEntry {
  const { id, label, description, priority, capability, fields } = box;
  return {
    id,
    label,
    description,
    priority,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// Allowlist for settings group entries — same rationale as the other
// `to*Entry` projections. `registeredBy` is server-only debug metadata.
// Fields ship through `toMetaBoxFieldEntry` — same projection as every
// other meta surface.
function toSettingsGroupEntry(
  group: RegisteredSettingsGroup,
): SettingsGroupManifestEntry {
  const { name, label, description, priority, capability, fields } = group;
  return {
    name,
    label,
    description,
    priority,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

function toSettingsPageEntry(
  page: RegisteredSettingsPage,
): SettingsPageManifestEntry {
  const { name, label, description, groups, priority } = page;
  return { name, label, description, groups, priority };
}

function toBlockEntry(block: RegisteredBlock): BlockManifestEntry {
  const { name, kind, schema, component } = block;
  return { name, kind, schema, component };
}

function toFieldTypeEntry(
  fieldType: RegisteredFieldType,
): FieldTypeManifestEntry {
  const { type, component } = fieldType;
  return { type, component };
}

// Per-variant options live on each narrowed variant of `MetaBoxField`.
// Reading via this explicit projection lets the serializer stay
// variant-agnostic — narrowed variants that don't carry a given
// option read back `undefined`, and the wire shape stays uniform
// regardless of which variant produced the field. `min` / `max` widen
// to `number | string` because date / datetime / time variants store
// ISO-string bounds while `number` stores numeric bounds; the wire
// shape mirrors that union and renderers branch on `inputType`.
interface MetaBoxFieldOptionView {
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly min?: number | string;
  readonly max?: number | string;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
  readonly referenceTarget?: ReferenceTarget;
}

function toEntryMetaBoxFieldEntry(
  field: EntryMetaBoxField,
): EntryMetaBoxFieldManifestEntry {
  const view = field as MetaBoxFieldOptionView;
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    inputType: field.inputType,
    description: field.description,
    required: field.required,
    placeholder: view.placeholder,
    maxLength: view.maxLength,
    min: view.min,
    max: view.max,
    step: view.step,
    options: view.options,
    default: field.default,
    referenceTarget: view.referenceTarget,
  };
}

function toMetaBoxFieldEntry(field: MetaBoxField): MetaBoxFieldManifestEntry {
  return { ...toEntryMetaBoxFieldEntry(field), span: field.span };
}

/**
 * Serialise a manifest into the `<script>` markup injected into the admin
 * `index.html`. The payload lives inside a `type="application/json"` block,
 * so it isn't executed — but a stray `</script>` sequence would still end
 * the tag and leak the remainder into the document. Escape the slash to
 * neutralise that, which is the standard JSON-in-HTML-script hardening.
 */
export function serializeManifestScript(manifest: PlumixManifest): string {
  const safe = JSON.stringify(manifest).replaceAll("</", "<\\/");
  return `<script id="${MANIFEST_SCRIPT_ID}" type="application/json">${safe}</script>`;
}

// Case-insensitive match on the script tag — Vite's bundler today emits
// lowercase tags and we control the placeholder, but minifiers upstream
// could normalise to uppercase and we'd rather match than silently fall
// through to the fail-fast branch.
const MANIFEST_SCRIPT_RE = new RegExp(
  `<script id="${MANIFEST_SCRIPT_ID}"[^>]*>[\\s\\S]*?</script>`,
  "i",
);

/**
 * Replace the `<script id="plumix-manifest">` placeholder in the admin's
 * `index.html` with a freshly serialised manifest. Throws if the placeholder
 * is missing — that's an indicator that the admin bundle is out of date
 * (was built without the placeholder), and silently appending would mask
 * the staleness.
 */
export function injectManifestIntoHtml(
  html: string,
  manifest: PlumixManifest,
): string {
  if (!MANIFEST_SCRIPT_RE.test(html)) {
    throw new Error(
      `Admin index.html is missing the <script id="${MANIFEST_SCRIPT_ID}"> ` +
        `placeholder. Rebuild @plumix/admin.`,
    );
  }
  return html.replace(MANIFEST_SCRIPT_RE, serializeManifestScript(manifest));
}
