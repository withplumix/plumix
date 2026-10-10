import type { Capability } from "../../access/contract/capability.js";
import type { Label } from "../../i18n/label.js";
import type { ImageRoleName } from "../../images/contract/role-images.js";
import type { JsonValue } from "../../json.js";
import type { MetaFieldCondition } from "./condition.js";
import type { StringInputType, TemporalInputType } from "./roster.js";
import { TEMPORAL_INPUT_TYPES } from "./roster.js";

// Re-exported so the builder re-export chain keeps resolving through this
// module.
export type { StringInputType, TemporalInputType };

export type MetaScalarType = "string" | "number" | "boolean" | "json";

/**
 * `true` means valid; a `Label` is the failure message shown to the editor.
 * Stored broad; the fluent chain narrows the parameter.
 */
export type MetaBoxFieldValidate = (
  value: unknown,
) => true | Label | Promise<true | Label>;

export interface MetaBoxFieldOption {
  readonly value: string;
  readonly label: Label;
}

/**
 * The object form is mobile-first. Breakpoints key off the card's own width
 * (container queries), not the viewport. Values outside 1..12 are clamped;
 * omitted means full width.
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
   * Enforced only on write: a row that bypassed the write pipeline reads as
   * whatever it stores, not as this type.
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
  /** The value a new entity starts with — see `startingMeta` (ADR 0026). */
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
   * Hidden in the admin from viewers lacking it; the server rejects writes
   * (including deletes) to the key. Top-level only: repeater subfield
   * capabilities are ignored.
   */
  readonly capability?: Capability;
  /**
   * Public REST only; default-deny. A role field's `images.<role>` reads its
   * own flag wherever it sits, never inheriting a parent group's.
   */
  readonly showInApi?: boolean;
  /**
   * Default-deny: meta holds plugin bookkeeping as often as prose. Server-only,
   * omitted from the wire manifest, and inert without a search plugin.
   */
  readonly searchable?: boolean;
  /**
   * Conditional visibility — OR-of-AND rule groups addressing sibling
   * driver fields by key, authored via the builders'
   * `.visibleWhen()` / `.orVisibleWhen()` chains. Semantics live in
   * `isFieldVisible`.
   */
  readonly visibleWhen?: MetaFieldCondition;
  /** Server-only; omitted from the wire manifest. */
  readonly role?: ImageRoleName;
}

// Carried only by the variants whose admin control renders it.
interface MetaBoxFieldAdornments {
  readonly prepend?: Label;
  readonly append?: Label;
}

/**
 * `I` is not bound to {@link StringInputType}: a plugin string input (`tel`,
 * say) reuses this shape and lands in the union as a {@link
 * LegacyMetaBoxField}.
 */
export interface StringMetaBoxField<I extends string = StringInputType>
  extends MetaBoxFieldBase, MetaBoxFieldAdornments {
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
export interface NumberMetaBoxField
  extends MetaBoxFieldBase, MetaBoxFieldAdornments {
  readonly inputType: "number";
  readonly type: "number";
  readonly placeholder?: Label;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/**
 * ISO strings compare lexicographically in temporal order, so `min` / `max`
 * share the stored format. `returns: "date"` reads a UTC-anchored `Date`; a
 * `time` anchors to 1970-01-01.
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
 * Seconds appear only when nonzero, matching native inputs. Callers guard
 * invalid Dates.
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
 * Must stay the exact inverse of `formatTemporalValue`: `date` anchors at UTC
 * midnight, `time` on 1970-01-01 UTC.
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
 * Naive local time from `<input type="datetime-local">`, no offset; consumers
 * needing timezones anchor explicitly.
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
 * `"id"` skips the read-time resolution join and its orphan-stripping; storage
 * and writes are unaffected.
 */
export type ReferenceReadProjection = "id";

/**
 * `kind` names a registered `LookupAdapter`, which interprets `scope` by its
 * own contract.
 */
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
 * Stored as the bare user id string; reads return `null` when the user is gone
 * or no longer matches scope.
 */
export interface UserMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "user";
  readonly type: "string";
  readonly referenceTarget: ReferenceTarget;
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
  readonly returns?: ReferenceReadProjection;
}

/**
 * Reads drop orphans rather than nulling them, so the array stays dense; `max`
 * caps its length at write time.
 */
export interface UserListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "userList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
  readonly returns?: ReferenceReadProjection;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Reads return `null` when the entry is gone, scope-mismatched, or trashed.
 * The `Reference` infix avoids clashing with `EntryMetaBoxOptions`.
 */
export interface EntryReferenceMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "entry";
  readonly type: "string";
  readonly referenceTarget: ReferenceTarget;
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
  readonly returns?: ReferenceReadProjection;
}

/**
 * Reads drop orphans, keeping the array dense; `max` caps its length at write
 * time. `entryTypes` scope is required.
 */
export interface EntryListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "entryList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
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
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
  readonly returns?: ReferenceReadProjection;
}

/**
 * Reads drop orphans, keeping the array dense; `max` caps its length.
 * `termTaxonomies` scope is required.
 */
export interface TermListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "termList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
  readonly returns?: ReferenceReadProjection;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Reads return `null` for orphans or scope mismatches. Declared in core so the
 * builder narrows; `@plumix/plugin-media` ships the builder and adapter.
 */
export interface MediaMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "media";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
  readonly returns?: ReferenceReadProjection;
}

/**
 * Reads drop orphans, keeping the array dense; `max` caps its length at write
 * time.
 */
export interface MediaListMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "mediaList";
  readonly type: "json";
  readonly referenceTarget: ReferenceTarget;
  /**
   * `.returns("id")`: reads yield the bare stored id, skipping the read-time
   * resolution join. See {@link ReferenceReadProjection}.
   */
  readonly returns?: ReferenceReadProjection;
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * `marks`, `nodes` and `blocks` are strict allowlists: anything omitted is
 * denied, even standard Tiptap extensions. `doc` / `paragraph` / `text` are
 * always implied.
 */
export interface RichtextMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "richtext";
  readonly type: "json";
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}

/**
 * Pure UI: the stored value shape is identical across layouts. `block` is the
 * default.
 */
export type RepeaterLayout = "block" | "row" | "table";

/** Pure UI: the stored row shape is unaffected. `md` is the default. */
export type RepeaterDialogSize = "sm" | "md" | "lg";

/**
 * Fixed row schema; mixed-row flexible content is out of scope. Rows whose
 * every subfield is `null`, `undefined` or `""` are dropped; `0` and `false`
 * count as values.
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
  /**
   * Row-editor dialog width — see {@link RepeaterDialogSize}. Defaults to `md`.
   */
  readonly dialogSize?: RepeaterDialogSize;
}

/**
 * Stored as a nested object under the group's own key; member keys are not
 * flattened.
 */
export interface GroupMetaBoxField extends MetaBoxFieldBase {
  readonly inputType: "group";
  readonly type: "json";
  readonly fields: readonly MetaBoxField[];
}

/**
 * Pure UI: never changes the value shape. Absent means the cardinality
 * default: dropdown for single, buttons for multiple.
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

/** `url` is an internal path (starting `/`) or an external absolute URL. */
/**
 * A `type`: interfaces lack the implicit index signature, so can't assign to
 * `JsonObject`.
 */
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
export interface LinkMetaBoxField
  extends MetaBoxFieldBase, MetaBoxFieldAdornments {
  readonly inputType: "link";
  readonly type: "json";
  readonly placeholder?: Label;
}

/** Catch-all for plugin-registered `inputType`s from `registerFieldType`. */
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
 * Declaring a meta box is the only way to register a meta key; there is no
 * separate `registerMeta` step.
 */
export type MetaBoxField = CanonicalMetaBoxField | LegacyMetaBoxField;

/**
 * Excludes `LegacyMetaBoxField`, whose `inputType: string` would widen the
 * discriminant. `Media*` variants belong here though the media plugin, not the
 * roster, owns them.
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
 * Chain method names collide with the definition's data properties, so a
 * builder can't structurally be its definition; registration surfaces call
 * `build()`.
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

/**
 * Compile a `fields` array down to definitions — builders build, plain
 * definitions pass through.
 */
export function compileMetaBoxFields(
  fields: readonly MetaBoxFieldInput[],
): readonly MetaBoxField[] {
  return fields.map((field) => ("build" in field ? field.build() : field));
}
