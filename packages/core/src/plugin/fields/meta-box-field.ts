// Meta-box field vocabulary — the `MetaBoxField` discriminated union, its
// per-variant shapes, the temporal value helpers, and `compileMetaBoxFields`.
// Extracted from `../manifest.js` so the fluent field builders in this
// directory depend on their variant types directly, breaking the former
// `fields/* → manifest` import cycle. Re-exported unchanged from the public
// `@plumix/core/manifest` barrel.

import type { Label } from "../../i18n/label.js";
import type { JsonValue } from "../../json.js";
import type { MetaFieldCondition } from "./condition.js";
import type { StringInputType, TemporalInputType } from "./roster.js";
import { TEMPORAL_INPUT_TYPES } from "./roster.js";

// The string / temporal input-type unions derive from the runtime roster
// arrays (see `./roster.js`) so a family's value list and its type share
// one source. Re-exported here to keep the `plumix/fields` barrel and the
// builder re-export chain pointing at `meta-box-field.js` unchanged.
export type { StringInputType, TemporalInputType };

export type MetaScalarType = "string" | "number" | "boolean" | "json";

/**
 * Stored shape of a field's `.validate()` callback. Sync or async;
 * `true` means valid, a `Label` is the failure message surfaced to the
 * editor. The fluent chain types the parameter with the field's
 * narrowed value type; the definition stores it broad.
 */
export type MetaBoxFieldValidate = (
  value: unknown,
) => true | Label | Promise<true | Label>;

export interface MetaBoxFieldOption {
  readonly value: string;
  readonly label: Label;
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
  readonly label: Label;
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
  readonly sanitize?: (value: unknown) => JsonValue;
  /**
   * Custom validation predicate — see `MetaBoxFieldValidate`. Executed
   * server-side by the constraint walker, after `.sanitize()` and the
   * declarative constraints.
   */
  readonly validate?: MetaBoxFieldValidate;
  /** Static adornment rendered before the input (e.g. a URL scheme). */
  readonly prepend?: Label;
  /** Static adornment rendered after the input (e.g. a unit suffix). */
  readonly append?: Label;
  /** Default surfaced in the admin form when the key has no saved value. */
  readonly default?: unknown;
  /** Optional help text rendered under the label on every input type. */
  readonly description?: Label;
  /** Renders `required` on the native input; server validation is separate. */
  readonly required?: boolean;
  /**
   * Column span within the meta box's 12-column grid. Defaults to full
   * width. See `MetaBoxFieldSpan` for the responsive object form.
   */
  readonly span?: MetaBoxFieldSpan;
  /**
   * Capability gate for the individual field. When set, the admin hides
   * the field from viewers whose capability set lacks it. The server
   * rejects entry/term/user writes that include the field's key — both
   * upserts and deletes count, so a viewer can't blank a value they
   * can't see. Gating applies at the top-level field only; capabilities
   * on repeater subfields are ignored (a row's gate is the parent
   * repeater field's gate). Defaults to no gating.
   */
  readonly capability?: string;
  /**
   * Expose this field's value on the public REST API. Default-deny: meta is
   * hidden from REST responses unless a field opts in with `showInApi: true`,
   * so internal fields never leak by default. Has no effect on the admin RPC.
   */
  readonly showInApi?: boolean;
  /**
   * Conditional visibility — OR-of-AND rule groups addressing sibling
   * driver fields by key, authored via the builders'
   * `.visibleWhen()` / `.orVisibleWhen()` chains. Semantics live in
   * `isFieldVisible`.
   */
  readonly visibleWhen?: MetaFieldCondition;
  /**
   * Semantic role a media field plays for its entry. `"featured"` marks
   * the entry's representative image (its first consumer is `og:image`
   * head wiring); `"ogImage"` is an explicit social-share override that
   * outranks the featured field. Server-only — omitted from the wire
   * manifest. Set via the media builder's `.featured()` / `.ogImage()`.
   */
  readonly role?: "featured" | "ogImage";
}

/**
 * Shared shape of the five string scalar variants produced by the
 * fluent builders exported from `plumix/fields` — they differ only in
 * their `inputType` literal. Downstream consumers rely on the narrowed
 * shape via the `inputType` discriminator.
 *
 * `I` is not bound to {@link StringInputType}: a plugin contributing a
 * string-shaped input through `registerFieldType` (`tel`, say) reuses
 * this shape and the builder over it rather than restating either. Such
 * a field lands in the union as a {@link LegacyMetaBoxField}, which is
 * what keeps the name out of the built-in roster.
 */
export interface StringMetaBoxField<
  I extends string = StringInputType,
> extends MetaBoxFieldBase {
  readonly inputType: I;
  readonly type: "string";
  readonly placeholder?: Label;
  readonly maxLength?: number;
}

/** Single-line text input. */
export type TextMetaBoxField = StringMetaBoxField<"text">;

/** Multi-line text input. Storage shape mirrors `text`. */
export type TextareaMetaBoxField = StringMetaBoxField<"textarea">;

/** RFC-5322-shaped email input. */
export type EmailMetaBoxField = StringMetaBoxField<"email">;

/** URL input. */
export type UrlMetaBoxField = StringMetaBoxField<"url">;

/**
 * Masked-input password field. Visually hides characters in the admin
 * so values aren't shoulder-surfable in shared sessions; storage
 * shape mirrors `text`.
 */
export type PasswordMetaBoxField = StringMetaBoxField<"password">;

/** Numeric input with optional `min` / `max` / `step` bounds. */
export interface NumberMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "number";
  readonly type: "number";
  readonly placeholder?: Label;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/**
 * Shared shape of the three temporal variants produced by the fluent
 * builders — they differ only in their `inputType` literal and the
 * ISO shape of the stored string. `min` / `max` bounds use the same
 * format as the stored value; the constraint walker enforces them
 * server-side (ISO shapes compare lexicographically in temporal
 * order).
 *
 * `returns: "date"` opts the field's reads into a decode-time
 * projection: the stored ISO string is handed to consumers as a JS
 * `Date` with its wall-clock components anchored to UTC (a `time`
 * value anchors to 1970-01-01 UTC). Storage and the write contract
 * stay ISO strings either way.
 */
export interface TemporalMetaBoxField<
  I extends TemporalInputType = TemporalInputType,
> extends MetaBoxFieldBase {
  readonly inputType: I;
  readonly type: "string";
  readonly min?: string;
  readonly max?: string;
  readonly returns?: "date";
}

/**
 * Format a UTC-anchored `Date` into the ISO string shape a temporal
 * field stores (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS]`, `HH:MM[:SS]`).
 * Seconds appear only when nonzero, mirroring what the native inputs
 * emit. Shared by the server-side meta write encoder and the admin's
 * input prefill so the two can't drift; callers guard invalid Dates.
 */
export function formatTemporalValue(
  inputType: TemporalInputType,
  value: Date,
): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const day = `${String(value.getUTCFullYear()).padStart(4, "0")}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  if (inputType === "date") return day;
  const seconds = value.getUTCSeconds();
  const clock =
    `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` +
    (seconds === 0 ? "" : `:${pad(seconds)}`);
  return inputType === "time" ? clock : `${day}T${clock}`;
}

export function isTemporalInputType(
  inputType: string,
): inputType is TemporalInputType {
  return (TEMPORAL_INPUT_TYPES as readonly string[]).includes(inputType);
}

// Stored ISO shapes the native temporal inputs produce. The regex pins
// the shape; the UTC-anchored `Date` parse rejects impossible
// wall-clock values (`2026-13-45`, `25:99`) the shape alone admits.
const TEMPORAL_SHAPES: Record<TemporalInputType, RegExp> = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
  time: /^\d{2}:\d{2}(:\d{2})?$/,
};

/**
 * Anchor a stored temporal string to a UTC-parseable form — `date` at
 * UTC midnight, `time` on 1970-01-01 UTC. The single source of the
 * anchoring rule shared by the read-side `Date` projection and the
 * write-side validity check, which must stay exact inverses of
 * `formatTemporalValue`.
 */
export function anchorTemporalUtc(
  inputType: TemporalInputType,
  value: string,
): string {
  switch (inputType) {
    case "date":
      return `${value}T00:00Z`;
    case "datetime":
      return `${value}Z`;
    case "time":
      return `1970-01-01T${value}Z`;
  }
}

/** Whether a string is a well-formed stored value (shape + real
 *  wall-clock) for the given temporal input type. */
export function isValidTemporalValue(
  inputType: TemporalInputType,
  value: string,
): boolean {
  if (!TEMPORAL_SHAPES[inputType].test(value)) return false;
  return !Number.isNaN(new Date(anchorTemporalUtc(inputType, value)).getTime());
}

/**
 * Date-only field. Stored as `YYYY-MM-DD` (ISO 8601 calendar date,
 * no time, no timezone).
 */
export type DateMetaBoxField = TemporalMetaBoxField<"date">;

/**
 * Date + time field. Stored as a partial ISO 8601 string
 * (`YYYY-MM-DDTHH:MM` with optional `:SS`) reflecting whatever the
 * author's browser produced via `<input type="datetime-local">` —
 * naive local time, no timezone offset baked in. Consumers who need
 * timezone semantics anchor explicitly via `parseMetaDate` + their
 * own `Temporal.ZonedDateTime` shaping.
 */
export type DateTimeMetaBoxField = TemporalMetaBoxField<"datetime">;

/**
 * Time-only field. Stored as `HH:MM` (with optional `:SS`). No date
 * anchor, no timezone — useful for "open at 09:00" style values where
 * the calendar date is supplied separately.
 */
export type TimeMetaBoxField = TemporalMetaBoxField<"time">;

/**
 * Hex color picker. Stored as a `#xxxxxx` string (the format the
 * native `<input type="color">` produces). The constraint walker
 * rejects non-hex values (and lowercases) on write.
 */
export interface ColorMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "color";
  readonly type: "string";
}

/**
 * Bounded numeric slider. Renders as `<input type="range">`. `min` /
 * `max` are required so the slider has a concrete range; `step`
 * defaults to `1`. The constraint walker enforces the bounds on
 * write.
 */
export interface RangeMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "range";
  readonly type: "number";
  readonly min: number;
  readonly max: number;
  readonly step?: number;
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
/**
 * Read-projection opt-out carried on a reference field. `"id"` makes the
 * field's reads yield the bare stored id(s) instead of the resolved
 * summary — the read pipeline skips the batched resolution join (and its
 * orphan-stripping) for that field. Storage and the write contract are
 * unaffected. Authored via the builder's `.returns("id")`.
 */
export type ReferenceReadProjection = "id";

export interface ReferenceTarget<TScope = unknown> {
  readonly kind: string;
  readonly scope?: TScope;
  /**
   * Storage cardinality. `false`/absent → single bare id string.
   * `true` → array of bare id strings. The server-side write
   * validator and read-side orphan filter dispatch on this flag to
   * handle both shapes uniformly.
   */
  readonly multiple?: boolean;
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
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
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
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Single entry reference. Storage is the bare entry id as a string;
 * reads return `null` when the entry is gone, scope-mismatched, or
 * trashed. `referenceTarget.scope` carries `entryTypes` (the only
 * entry-type names this field accepts).
 *
 * Naming note: the `Reference` infix keeps the name clear of the
 * entry-meta-box option types (`EntryMetaBoxOptions` and friends).
 */
export interface EntryReferenceMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "entry";
  readonly type: "string";
  readonly referenceTarget: ReferenceTarget;
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
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
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
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
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
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
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Single media reference. Storage is the bare media id as a string;
 * reads return `null` for orphans / scope mismatches, and admin
 * renders resolve labels through the lookup path.
 *
 * Lives in core so the typed builder narrows correctly at call
 * sites — same convention as `entry` / `term`. The actual builder
 * + adapter are in `@plumix/plugin-media`.
 */
export interface MediaMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "media";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
}

/**
 * Multi media reference. Storage is a JSON array of bare media ids;
 * reads filter out orphans the same way `EntryListMetaBoxField`
 * does. `referenceTarget.multiple` is `true`; `max` caps the array
 * length at write time.
 */
export interface MediaListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "mediaList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /** `.returns("id")`: reads yield the bare stored id, skipping the read-time resolution join. See {@link ReferenceReadProjection}. */
  readonly returns?: ReferenceReadProjection;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Richtext field — Tiptap ProseMirror JSON storage. `marks`, `nodes`,
 * and `blocks` are strict allowlists: omitted entries are denied even
 * if they're standard Tiptap extensions. `doc`/`paragraph`/`text` are
 * always included implicitly because ProseMirror requires them for
 * any document to parse.
 *
 * `marks` are inline formatters (`bold`, `italic`, `link`, …).
 * `nodes` are block-level Tiptap nodes (`heading`, `bulletList`,
 * `codeBlock`, …). `blocks` is a forward-compatible allowlist of
 * custom node names — the validator accepts documents containing them,
 * leaving the theme-side block render registry (planned) responsible
 * for actually drawing them.
 *
 * Server-side validator (`walkRichtextDoc`) walks the saved doc and
 * rejects any node/mark/block name outside the allowlist. The admin
 * toolbar surfaces only the buttons that match the allowlist.
 *
 * Replaces the dropped `markdown` and `code` standalone field types —
 * `richtext("body").nodes(["codeBlock"])` covers code-in-meta;
 * `richtext("body").marks(["bold","italic","link"]).nodes(["bulletList","orderedList"])`
 * covers markdown-shaped formatting.
 */
export interface RichtextMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "richtext";
  readonly type: "json";
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}

/**
 * Admin layout for a repeater's rows. `block` (the default) stacks each
 * row's fields vertically in a bordered card; `row` lays a single row's
 * fields out inline on one line; `table` renders the rows as aligned
 * table lines with a shared subfield header. A pure-UI axis — the
 * stored value shape is identical across layouts.
 */
export type RepeaterLayout = "block" | "row" | "table";

/**
 * Width of the admin row-editor dialog. A pure-UI hint: `sm` suits a
 * couple of narrow fields, `md` (the default) the common case, `lg` a
 * dense multi-column row. Maps to a max-width in the admin; the stored
 * row shape is unaffected.
 */
export type RepeaterDialogSize = "sm" | "md" | "lg";

/**
 * List of structured rows. Each row carries the same fixed schema
 * declared via `subFields`; mixed-row "flexible content" is explicitly
 * out of scope. Subfields may be any registered field type, including
 * nested repeaters and groups — types recurse through arbitrarily
 * nested rows.
 *
 * Storage rides on the `json` primitive so any JSON-serialisable row
 * shape survives the wire. The constraint walker drops rows where
 * every subfield value is empty (`null` / `undefined` / `""`), then
 * enforces optional `min` / `max` row counts. "Empty" is strictly
 * those three: a row whose only populated subfield is `0` (number) or
 * `false` (toggle) survives — those are real values.
 */
export interface RepeaterMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "repeater";
  readonly type: "json";
  readonly subFields: readonly MetaBoxField[];
  readonly min?: number;
  readonly max?: number;
  /** Custom label for the add-row button (default "Add row"). */
  readonly addLabel?: Label;
  /** Admin row layout — see {@link RepeaterLayout}. Defaults to `block`. */
  readonly layout?: RepeaterLayout;
  /**
   * Sub-field key whose stored value labels a collapsed row. Setting it
   * makes rows collapsible in the admin and each collapsed row shows the
   * chosen sub-field's value as its summary.
   */
  readonly collapsed?: string;
  /** Row-editor dialog width — see {@link RepeaterDialogSize}. Defaults to `md`. */
  readonly dialogSize?: RepeaterDialogSize;
}

/**
 * A named group of fields stored as a nested object under the group's
 * own key — no key-flattening. `fields` declares the members; each
 * member may be any registered field type, including nested repeaters
 * and further groups (types recurse). Storage rides on the `json`
 * primitive as a plain record keyed by member field key.
 */
export interface GroupMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "group";
  readonly type: "json";
  readonly fields: readonly MetaBoxField[];
}

/**
 * Pure-UI control axis for choice fields. Maps to the admin's existing
 * controls — dropdown, radio group, toggle-button group, checkbox
 * list — and never changes the value shape. Cardinality restricts the
 * legal values (`radio` is single-only, `checkboxes` multi-only); the
 * fluent builder enforces that at compile time. Absent means the
 * cardinality default: dropdown for single, buttons for multiple.
 */
export type SelectAppearance = "select" | "radio" | "buttons" | "checkboxes";

/** Single-value choice — storage is the selected option value string. */
export interface SingleSelectMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "select";
  readonly type: "string";
  readonly options: readonly MetaBoxFieldOption[];
  readonly multiple?: false;
  readonly appearance?: SelectAppearance;
}

/** Multi-value choice — storage is a JSON array of option value strings. */
export interface MultiSelectMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "select";
  readonly type: "json";
  readonly options: readonly MetaBoxFieldOption[];
  readonly multiple: true;
  /**
   * Selection-count cap. Carried on the definition and the wire today;
   * server-side enforcement lands with the generic constraint walker.
   */
  readonly max?: number;
  readonly appearance?: SelectAppearance;
}

/**
 * Choice field over a fixed option list. Cardinality and storage type
 * are correlated variants — `multiple` requires `type: "json"` — so an
 * object literal can't declare an array-emitting control over scalar
 * storage.
 */
export type SelectMetaBoxField =
  SingleSelectMetaBoxField | MultiSelectMetaBoxField;

/**
 * Boolean switch — storage type pinned to `boolean`. Renders as the
 * admin's switch control; `onText` / `offText` label the current state
 * beside it.
 */
export interface ToggleMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "toggle";
  readonly type: "boolean";
  readonly onText?: Label;
  readonly offText?: Label;
}

/**
 * Stored value of a `link` field — a CTA-shaped destination. `url` is
 * either an internal path (starts with `/`, produced by the admin's
 * entry picker resolving an entry to its permalink) or an external
 * absolute URL. `label` is the optional link text; `newTab` opts the
 * rendered anchor into `target="_blank"`.
 */
// Spelled as a `type`, not an `interface`: TypeScript withholds the implicit
// index signature from an interface, so an interface never assigns to
// `JsonObject` however JSON-shaped its members are — and a link value is
// stored in the meta bag and sanitized as JSON on the way in.
export type LinkValue = Readonly<{
  url: string;
  label?: string;
  newTab?: boolean;
}>;

/**
 * CTA-style link field authored via `link()`. Storage rides on the
 * `json` primitive as a `LinkValue`; the injected sanitizer rejects
 * malformed shapes and URLs on write.
 */
export interface LinkMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "link";
  readonly type: "json";
  readonly placeholder?: Label;
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
  readonly placeholder?: Label;
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
export type MetaBoxField = CanonicalMetaBoxField | LegacyMetaBoxField;

/**
 * The narrowed variants only — every built-in with a literal `inputType`
 * discriminant, excluding the `LegacyMetaBoxField` catch-all (whose
 * `inputType: string` would otherwise widen the union's discriminant to
 * `string`). Keeping this split lets `CanonicalMetaBoxField["inputType"]`
 * yield the exact literal set the field-type roster's exhaustiveness guard
 * binds itself to (see `./roster.js`). `Media*` variants are members here
 * even though they are not roster entries — the roster is a subset of the
 * union (`roster ⊆ union`), the media plugin owning those names.
 */
export type CanonicalMetaBoxField =
  | StringMetaBoxField
  | NumberMetaBoxField
  | TemporalMetaBoxField
  | ColorMetaBoxField
  | RangeMetaBoxField
  | JsonMetaBoxField
  | UserMetaBoxField
  | UserListMetaBoxField
  | EntryReferenceMetaBoxField
  | EntryListMetaBoxField
  | TermReferenceMetaBoxField
  | TermListMetaBoxField
  | MediaMetaBoxField
  | MediaListMetaBoxField
  | RichtextMetaBoxField
  | RepeaterMetaBoxField
  | GroupMetaBoxField
  | SelectMetaBoxField
  | ToggleMetaBoxField
  | LinkMetaBoxField;

/**
 * A fluent field builder — an immutable chain that compiles to a
 * narrowed `MetaBoxField` variant. Chain method names (`label`,
 * `default`, `sanitize`, …) collide with the definition's data
 * properties, so a builder can't structurally *be* its definition;
 * registration surfaces accept either shape and call `build()` on
 * builders at registration time.
 */
export interface FieldBuilder<F extends MetaBoxField = MetaBoxField> {
  build(): F;
}

/**
 * What `fields` arrays accept on every registration surface: a fluent
 * builder or a compiled field definition (object-literal authoring and
 * `registerFieldType` custom fields).
 */
export type MetaBoxFieldInput = MetaBoxField | FieldBuilder;

/** Compile a `fields` array down to definitions — builders build, plain definitions pass through. */
export function compileMetaBoxFields(
  fields: readonly MetaBoxFieldInput[],
): readonly MetaBoxField[] {
  return fields.map((field) => ("build" in field ? field.build() : field));
}
