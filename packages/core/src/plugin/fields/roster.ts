// The field-type roster — the single runtime vocabulary of built-in
// `inputType` names, grouped by family. It is the one source the admin's
// reserved-name set, the admin's `console.warn` prose list, and the
// type-level input unions all derive from, replacing the copies that used
// to be hand-synced across `core` and `admin` (and had drifted). The
// exhaustiveness guard at the foot binds the roster to the `MetaBoxField`
// union so the two can never disagree again.
//
// Adding a built-in field type is now local: append its name to the right
// family array here, add the narrowed union variant + its builder, and the
// guard fails `pnpm typecheck` until the array and the union agree.
//
// Re-exported as a public surface from `plumix/fields`.

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
 * Host built-in reference kinds — `user` / `entry` / `term` and their list
 * variants. `media` / `mediaList` are deliberately absent: they are
 * plugin-contributed (`@plumix/plugin-media` ships their builders, lookup
 * adapters, and admin renderers), so they self-register and stay
 * unreserved. This is what makes the roster a subset of the union rather
 * than equal to it.
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

/** Structural inputs storing composite JSON (rich text, nested rows, CTA link). */
export const STRUCTURAL_INPUT_TYPES = [
  "richtext",
  "repeater",
  "group",
  "link",
] as const;

/**
 * Retired input types. Reserved (so a plugin can't claim the name) and
 * still rendered by the admin's back-compat renderers, but NOT authorable
 * — they have no builder and no narrowed union variant, folding into the
 * `LegacyMetaBoxField` catch-all instead.
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

// --- exhaustiveness guard ----------------------------------------------
// A compile-time, type-level assertion binding the canonical roster to the
// narrowed `MetaBoxField` union. Multi-name families (string, temporal)
// derive their variant's `inputType` from the arrays above, so they can't
// drift by construction; this guard covers the singleton variants and the
// roster ⊆ union relationship. It has no runtime footprint.

type Assert<T extends true> = T;

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/**
 * Plugin-contributed reference kinds that live in the core union but are
 * not roster members — media self-registers its admin renderers, so it is
 * unreserved (roster ⊆ union). Parking them here keeps the guard's
 * equality honest while documenting the one gap between roster and union.
 */
type ParkedInputType = "media" | "mediaList";

/**
 * The canonical roster names, unioned with the parked plugin kinds, must
 * exactly equal the narrowed union's `inputType` discriminants. Adding a
 * `CanonicalMetaBoxField` variant without a roster entry (or a roster entry
 * without a variant) breaks this equality and fails `pnpm typecheck`.
 */
// Not exported — the alias declaration itself is the assertion (TypeScript
// evaluates the `AssertTrue<… extends true>` constraint here), so nothing
// needs to consume it.
type _RosterBindsUnion = Assert<
  Equals<
    (typeof CANONICAL_INPUT_TYPES)[number] | ParkedInputType,
    CanonicalMetaBoxField["inputType"]
  >
>;
