import type { CanonicalMetaBoxField } from "./meta-box-field.js";

/** String-scalar inputs sharing one field shape (`StringMetaBoxField`). */
export const STRING_INPUT_TYPES = [
  "text",
  "textarea",
  "email",
  "url",
  "password",
] as const;

/** Temporal inputs sharing one field shape (`TemporalMetaBoxField`). */
export const TEMPORAL_INPUT_TYPES = ["date", "datetime", "time"] as const;

/** Single-primitive scalar inputs, one narrowed variant each. */
export const SCALAR_INPUT_TYPES = ["number", "color", "range", "json"] as const;

/**
 * `media` / `mediaList` are absent: the media plugin contributes them, so they
 * self-register and stay unreserved.
 */
export const REFERENCE_INPUT_TYPES = [
  "user",
  "userList",
  "entry",
  "entryList",
  "term",
  "termList",
] as const;

/** Choice inputs — the option-list `select` and the boolean `toggle`. */
export const CHOICE_INPUT_TYPES = ["select", "toggle"] as const;

/**
 * Structural inputs storing composite JSON (rich text, nested rows, CTA link).
 */
export const STRUCTURAL_INPUT_TYPES = [
  "richtext",
  "repeater",
  "group",
  "link",
] as const;

/**
 * Reserved and still rendered by the admin, but not authorable: no builder and
 * no narrowed variant.
 */
export const LEGACY_INPUT_TYPES = ["checkbox", "radio", "multiselect"] as const;

/**
 * The full canonical roster: every authorable built-in name, the
 * concatenation of the non-legacy families. Sources the admin's
 * `console.warn` list; unioned with {@link LEGACY_INPUT_TYPES} it sources
 * the admin's reserved set.
 */
export const CANONICAL_INPUT_TYPES = [
  ...STRING_INPUT_TYPES,
  ...TEMPORAL_INPUT_TYPES,
  ...SCALAR_INPUT_TYPES,
  ...REFERENCE_INPUT_TYPES,
  ...CHOICE_INPUT_TYPES,
  ...STRUCTURAL_INPUT_TYPES,
] as const;

/**
 * The five string-scalar input types, derived from
 * {@link STRING_INPUT_TYPES} so the value list and the type share one
 * source and cannot disagree.
 */
export type StringInputType = (typeof STRING_INPUT_TYPES)[number];

/**
 * The three temporal input types, derived from
 * {@link TEMPORAL_INPUT_TYPES}. See {@link StringInputType} for why the
 * type derives from the array.
 */
export type TemporalInputType = (typeof TEMPORAL_INPUT_TYPES)[number];

// Multi-name families derive their `inputType` from the arrays above, so the
// guard below only has to cover the singleton variants.

type Assert<T extends true> = T;

/**
 * Each `<T>()` is deliberately single-use: deferring the conditional is what
 * makes this exact equality rather than mutual assignability.
 */
type Equals<A, B> =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/**
 * In the core union but not the roster: media self-registers its admin
 * renderers, so it stays unreserved.
 */
type ParkedInputType = "media" | "mediaList";

/**
 * The roster plus the parked kinds must equal the union's `inputType`
 * discriminants; a variant without a roster entry, or the reverse, fails
 * typecheck.
 */
type _RosterBindsUnion = Assert<
  Equals<
    (typeof CANONICAL_INPUT_TYPES)[number] | ParkedInputType,
    CanonicalMetaBoxField["inputType"]
  >
>;
