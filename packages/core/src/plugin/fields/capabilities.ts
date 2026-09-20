// The builder capability matrix — which fluent chain offers which
// cross-cutting method, declared once instead of inferred by reading
// thirteen builder files side by side.
//
// The builders are deliberately not a class hierarchy: every chain method
// returns its own concrete builder type so the phantom key / value /
// stored parameters survive the call, and a shared supertype either loses
// that narrowing or collides with the `this`-parameter narrowing the
// multi-value-only rule factories use. The cost of hand-written chains is
// that parity is a convention, and conventions drift — `group` and
// `repeater` went without `.validate()` for as long as nobody compared the
// files. This matrix is what replaces the comparison: the guard at the
// foot binds it to the builder types, so a chain that does not offer a
// capability its row claims fails `pnpm typecheck`.
//
// Adding a builder: add its row here and its type to `BuilderTypes`. The
// guard fails until the row and the chain agree.

import type {
  ColorFieldBuilder,
  GroupFieldBuilder,
  JsonFieldBuilder,
  LinkFieldBuilder,
  MetaBoxFieldInput,
  NumberFieldBuilder,
  RangeFieldBuilder,
  ReferenceFieldBuilder,
  RepeaterFieldBuilder,
  RichtextFieldBuilder,
  SelectFieldBuilder,
  StringFieldBuilder,
  TemporalFieldBuilder,
  ToggleFieldBuilder,
} from "./index.js";

/**
 * The chain every builder carries, whatever it stores — the field's
 * label and layout, its capability gate, its visibility condition, and
 * the compile step. A builder missing one of these is never intentional.
 */
export const UNIVERSAL_CAPABILITIES = [
  "label",
  "description",
  "required",
  "span",
  "capability",
  "showInApi",
  "isEmpty",
  "isNotEmpty",
  "visibleWhen",
  "orVisibleWhen",
  "build",
] as const;

/**
 * Capabilities that could belong to more than one builder, and so can
 * silently drift out of step. Per-type options (`.marks()`, `.layout()`,
 * `.step()`) are deliberately absent: they answer to one input type, so
 * there is no parity to keep.
 */
export const CROSS_CUTTING_CAPABILITIES = [
  "default",
  "sanitize",
  "validate",
  "searchable",
  "is",
  "isNot",
  "contains",
  "notContains",
  "countGt",
  "countLt",
] as const;

type UniversalCapability = (typeof UNIVERSAL_CAPABILITIES)[number];
export type CrossCuttingCapability =
  (typeof CROSS_CUTTING_CAPABILITIES)[number];

/**
 * Which cross-cutting capabilities each builder offers. Read a column to
 * see where a capability stops; read a row to see what a chain can do.
 */
export const BUILDER_CAPABILITIES = {
  string: ["default", "sanitize", "validate", "searchable", "is", "isNot"],
  number: ["default", "sanitize", "validate", "is", "isNot"],
  temporal: ["default", "sanitize", "validate", "is", "isNot"],
  color: ["default", "sanitize", "validate", "is", "isNot"],
  range: ["default", "sanitize", "validate", "is", "isNot"],
  json: ["default", "sanitize", "validate", "is", "isNot"],
  richtext: ["default", "validate", "searchable", "is", "isNot"],
  link: ["default", "sanitize", "validate", "is", "isNot"],
  select: [
    "default",
    "sanitize",
    "validate",
    "is",
    "isNot",
    "contains",
    "notContains",
    "countGt",
    "countLt",
  ],
  toggle: ["default", "sanitize", "validate", "is", "isNot"],
  reference: [
    "default",
    "sanitize",
    "validate",
    "is",
    "isNot",
    "contains",
    "notContains",
    "countGt",
    "countLt",
  ],
  group: ["default", "sanitize", "validate"],
  repeater: ["default", "sanitize", "validate", "countGt", "countLt"],
} as const satisfies Record<string, readonly CrossCuttingCapability[]>;

export type BuilderName = keyof typeof BUILDER_CAPABILITIES;

/**
 * A cell a reader would expect the matrix to fill and it does not. Only
 * surprising absences belong here: `.searchable()` is missing from
 * `number` because a number is not text, which needs no defence, while
 * rich text holds text and still refuses it, which does.
 */
export const CAPABILITY_EXCEPTIONS = [
  {
    builder: "richtext",
    capability: "sanitize",
    reason:
      "a sanitizer could rewrite the document past the mark and node allowlist, which is the allowlist's whole job",
  },
  {
    builder: "group",
    capability: "is",
    reason:
      "structural equality against a whole member object compares members the author never named, including any a sanitizer reordered",
  },
  {
    builder: "group",
    capability: "isNot",
    reason:
      "the negation of a comparison nobody should be writing in the first place",
  },
  {
    builder: "repeater",
    capability: "is",
    reason:
      "structural equality against a whole row list compares every cell of every row; `.countGt()` and `.isEmpty()` are the rules this field actually wants",
  },
  {
    builder: "repeater",
    capability: "isNot",
    reason:
      "the negation of a comparison nobody should be writing in the first place",
  },
] as const satisfies readonly {
  readonly builder: BuilderName;
  readonly capability: CrossCuttingCapability;
  readonly reason: string;
}[];

/**
 * Notes that resist the matrix's shape: a capability whose reach is a
 * family rather than a cell, or one that is present but does not mean
 * quite what the column header suggests. They are data for the same
 * reason the exceptions are — so the answer lives in one place instead of
 * being rediscovered by reading thirteen builders.
 */
export const CAPABILITY_CAVEATS = [
  {
    subject: "searchable",
    reason:
      "text-like builders only — `.searchable()` feeds the search index, and nothing but text has anything to put in it",
  },
  {
    subject: "reference .default()",
    reason:
      "a reference default does not make the value non-optional: it applies at read decode, where a key storage lacks resolves to it, and nothing enforces it on write",
  },
  {
    subject: "media / mediaList builders",
    reason:
      "no row here because they are plugin-contributed — `@plumix/plugin-media` ships their builders, so they self-register and stay unreserved, the same reason the field-type roster leaves them out",
  },
] as const satisfies readonly {
  readonly subject: string;
  readonly reason: string;
}[];

// --- the guard ----------------------------------------------------------
//
// Binds the matrix above to the builder types. `MissingCapabilities`
// subtracts each builder's actual methods from the capabilities its row
// claims, so every entry should be `never`; `AssertNoMissingCapabilities`
// accepts nothing else, and the failing property names the builder that
// drifted. This is the check that makes the matrix a contract rather than
// a comment.

type AnyFields = readonly MetaBoxFieldInput[];

interface BuilderTypes {
  readonly string: StringFieldBuilder;
  readonly number: NumberFieldBuilder;
  readonly temporal: TemporalFieldBuilder;
  readonly color: ColorFieldBuilder;
  readonly range: RangeFieldBuilder;
  readonly json: JsonFieldBuilder;
  readonly richtext: RichtextFieldBuilder;
  readonly link: LinkFieldBuilder;
  readonly select: SelectFieldBuilder<string>;
  readonly toggle: ToggleFieldBuilder;
  readonly reference: ReferenceFieldBuilder<"entry">;
  readonly group: GroupFieldBuilder<AnyFields>;
  readonly repeater: RepeaterFieldBuilder<AnyFields>;
}

type Assert<T extends true> = T;

type CapabilitiesOf<N extends BuilderName> =
  (typeof BUILDER_CAPABILITIES)[N][number];

/**
 * Per builder, the capabilities its row claims that the chain does not
 * actually offer. Every entry should be `never`; anything else is the
 * drift, and it surfaces named — the failing property is the builder and
 * its type is the missing method.
 */
type MissingCapabilities = {
  readonly [N in BuilderName]: Exclude<
    UniversalCapability | CapabilitiesOf<N>,
    keyof BuilderTypes[N]
  >;
};

/**
 * Accepts a {@link MissingCapabilities} map only when every builder's
 * entry is `never`. Exported so the suite can demonstrate the guard
 * biting on a fabricated row — a guard nobody has seen fail is a guard
 * nobody knows works.
 */
export type AssertNoMissingCapabilities<T extends Record<BuilderName, never>> =
  T;

type _EveryBuilderHonoursItsRow =
  AssertNoMissingCapabilities<MissingCapabilities>;

// Every builder named in the matrix is a builder the guard knows how to
// check, and every builder the guard knows is named in the matrix.
type _MatrixCoversEveryBuilder = Assert<
  [Exclude<BuilderName, keyof BuilderTypes>] extends [never]
    ? [Exclude<keyof BuilderTypes, BuilderName>] extends [never]
      ? true
      : false
    : false
>;
