// Builders aren't a class hierarchy: each chain method returns its concrete
// builder so phantom types survive. The guard below fails typecheck when a
// chain lacks a capability its row claims.

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

/** Methods every builder carries, whatever it stores. */
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
 * Capabilities more than one builder offers, so they can drift. Per-type
 * options (`.marks()`, `.step()`) are absent: they answer to one input type.
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
 * Cells a reader would expect filled that are not. Only surprising absences
 * belong here.
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
 * Notes that don't fit a cell: a capability spanning a family, or one whose
 * meaning differs from its column header.
 */
export const CAPABILITY_CAVEATS = [
  {
    subject: "searchable",
    reason:
      "text-like builders only — `.searchable()` feeds the search index, and nothing but text has anything to put in it",
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

// Every `MissingCapabilities` entry must be `never`; a failing property names
// the builder that drifted and its type names the missing method.

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

type MissingCapabilities = {
  readonly [N in BuilderName]: Exclude<
    UniversalCapability | CapabilitiesOf<N>,
    keyof BuilderTypes[N]
  >;
};

/** Exported so the suite can show the guard failing on a fabricated row. */
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
