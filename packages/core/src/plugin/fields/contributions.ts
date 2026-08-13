import type {
  EntryProjection,
  EntryTypeName,
  TermProjection,
  TermTaxonomyName,
} from "../../template-registry.js";
import type { MetaBoxFieldInput } from "./meta-box-field.js";

/**
 * The typed-meta contribution registries. A meta box (or settings
 * group) registration is runtime-only — a `register*` call can't
 * augment a global interface — so typed reads cost one derived
 * declaration per box, merged from any package. The `EntryMeta` /
 * `TermMeta` / `UserMeta` / `SettingsMeta` helpers author that
 * declaration (see {@link EntryMeta} for the end-to-end walkthrough):
 *
 * ```ts
 * const articleFields = [text("subtitle").maxLength(120)];
 * declare module "plumix" {
 *   interface EntryMetaContributions {
 *     article: EntryMeta<"post", typeof articleFields>;
 *   }
 * }
 * ```
 *
 * `MetaOf<K>` then folds every contribution whose target set includes
 * `K` into one closed record — no open index fallback, so a mistyped
 * field name is a compile error at the read site. A box registered
 * without a declaration simply doesn't contribute (its fields read as
 * absent); any downstream package can supply the missing declaration
 * via interface merging. When a declaration exists, the matching
 * `register*` call is typechecked against it, so declaration and
 * runtime can't drift silently.
 */

/** Entry meta-box contributions, keyed by box id. `entryTypes` is a union of registered entry-type names. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface EntryMetaContributions {}

/** Term meta-box contributions, keyed by box id. `termTaxonomies` is a union of registered taxonomy names. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface TermMetaContributions {}

/** User meta-box contributions, keyed by box id. Users have a flat keyspace — every contribution applies. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface UserMetaContributions {}

/** Settings-group contributions, keyed by group name. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface SettingsContributions {}

/**
 * The shape of one entry meta-box contribution: the target entry type(s)
 * plus the fields array. A named alias so authors reach for a checked
 * two-generic helper instead of hand-writing the `{ entryTypes; fields }`
 * object — misspelling a property (`entryType`) would otherwise leave the
 * contribution structurally valid but silently unmatched by the fold, so
 * the fields read as *absent* with no error. `EntryTypes` is constrained
 * to registered names, so an unknown entry type errors at the declaration
 * itself rather than only at the `registerEntryMetaBox` call.
 *
 * The full path from declaring fields to typed template reads:
 *
 * ```ts
 * import { text } from "plumix/fields";
 * import type { EntryMeta } from "plumix";
 *
 * // 1. Author the fields as a named const so both the declaration and
 * //    the registration reference one source of truth.
 * const articleFields = [text("subtitle"), text("heroCredit").required()];
 *
 * // 2. Declare the contribution — this is what crosses package
 * //    boundaries so a theme in another package sees the meta shape.
 * declare module "plumix" {
 *   interface EntryMetaContributions {
 *     article: EntryMeta<"post", typeof articleFields>;
 *   }
 * }
 *
 * // 3. Register the box; the call is typechecked against the declaration
 * //    above (anti-drift), so the two can't diverge silently.
 * ctx.registerEntryMetaBox("article", {
 *   label: "Article",
 *   entryTypes: ["post"],
 *   fields: articleFields,
 * });
 *
 * // 4. In the theme, a targeted template reads typed meta:
 * //    `forEntryType("post").template(({ entry }) => entry.meta.subtitle)`
 * //    — `subtitle` is `string | undefined`, a typo is a compile error.
 * ```
 */
export interface EntryMeta<
  EntryTypes extends EntryTypeName,
  Fields extends readonly MetaBoxFieldInput[],
> {
  entryTypes: EntryTypes;
  fields: Fields;
}

/**
 * The shape of one term meta-box contribution — target taxonomy(s) plus
 * fields. The {@link EntryMeta} analogue over `termTaxonomies`; folds
 * through {@link TermMetaOf} for `forTaxonomy(...).template(...)` reads.
 */
export interface TermMeta<
  Taxonomies extends TermTaxonomyName,
  Fields extends readonly MetaBoxFieldInput[],
> {
  termTaxonomies: Taxonomies;
  fields: Fields;
}

/**
 * The shape of one user meta-box contribution. Users share a flat
 * keyspace, so there is no target set — every declared contribution folds
 * into {@link UserMetaOf}.
 */
export interface UserMeta<Fields extends readonly MetaBoxFieldInput[]> {
  fields: Fields;
}

/**
 * The shape of one settings-group contribution, keyed by group name in
 * {@link SettingsContributions}; folds through {@link SettingsOf}.
 */
export interface SettingsMeta<Fields extends readonly MetaBoxFieldInput[]> {
  fields: Fields;
}

// A fluent builder carrying the three phantoms the type flow reads.
// Object-literal field definitions have none, so `Extract` drops them —
// they degrade to absence from the typed record.
interface TypedField {
  readonly _key: string;
  readonly _value: unknown;
  readonly _stored: unknown;
}

type InferShape<
  F extends readonly MetaBoxFieldInput[],
  Prop extends "_value" | "_stored",
> = {
  [P in Extract<F[number], TypedField> as P["_key"]]: P[Prop];
};

/**
 * The read-shape record a fields array declares: one property per
 * fluent field, keyed by the literal key, typed by the phantom read
 * type (defaults applied, references hydrated).
 */
export type InferFields<F extends readonly MetaBoxFieldInput[]> = InferShape<
  F,
  "_value"
>;

/**
 * The stored-shape record a fields array declares — what actually sits
 * in the meta JSON. Distinct from {@link InferFields}: `.default()`
 * narrows only the read shape (decode-time), and reference/temporal
 * fields store ids / ISO strings rather than hydrated values.
 */
export type InferStoredFields<F extends readonly MetaBoxFieldInput[]> =
  InferShape<F, "_stored">;

// The `infer` is bounded so a deferred `MetaOf<K>` (generic `K`) still
// satisfies `Record<string, unknown>` — what lets `ResolvedEntryFor<K>`
// meet the `ResolvedEntry` constraint on the template data shapes.
type UnionToIntersection<U> = (
  U extends unknown ? (u: U) => void : never
) extends (i: infer I extends Record<string, unknown>) => void
  ? I
  : never;

// The closed empty record a target with no contributions folds to.
// Deliberately NOT `Record<string, unknown>` — an open index signature
// would make every typo read as `unknown` instead of erroring.
type EmptyMeta = Record<never, never>;

type FoldRecords<R> = [R] extends [never] ? EmptyMeta : UnionToIntersection<R>;

// One record per contribution scoped to `K` via the `P`-named target-set
// property (`entryTypes` / `termTaxonomies`), in the chosen shape;
// out-of-scope and malformed contributions collapse to `never`.
type ScopedRecords<
  Contributions,
  K,
  P extends string,
  Prop extends "_value" | "_stored",
> = {
  [B in keyof Contributions]: Contributions[B] extends Record<P, infer T> & {
    fields: infer F extends readonly MetaBoxFieldInput[];
  }
    ? K extends T
      ? InferShape<F, Prop>
      : never
    : never;
}[keyof Contributions];

type AllRecords<Contributions, Prop extends "_value" | "_stored"> = {
  [B in keyof Contributions]: Contributions[B] extends {
    fields: infer F extends readonly MetaBoxFieldInput[];
  }
    ? InferShape<F, Prop>
    : never;
}[keyof Contributions];

/** The folded read-shape meta record for an entry type. Types template `data.entry.meta` reads. */
export type MetaOf<K extends EntryTypeName> = FoldRecords<
  ScopedRecords<EntryMetaContributions, K, "entryTypes", "_value">
>;

/** The folded stored-shape meta record for an entry type. Types `whereMeta` keys and values. */
export type StoredMetaOf<K extends EntryTypeName> = FoldRecords<
  ScopedRecords<EntryMetaContributions, K, "entryTypes", "_stored">
>;

/** The folded read-shape meta record for a registered taxonomy. */
export type TermMetaOf<K extends TermTaxonomyName> = FoldRecords<
  ScopedRecords<TermMetaContributions, K, "termTaxonomies", "_value">
>;

/** The folded stored-shape meta record for a taxonomy. Types term `whereMeta`. */
export type StoredTermMetaOf<K extends TermTaxonomyName> = FoldRecords<
  ScopedRecords<TermMetaContributions, K, "termTaxonomies", "_stored">
>;

/** The folded read-shape user meta record — users have a flat keyspace, so every contribution applies. */
export type UserMetaOf = FoldRecords<
  AllRecords<UserMetaContributions, "_value">
>;

/** The read-shape record of one settings group, by declared group name. */
export type SettingsOf<Name extends keyof SettingsContributions> = FoldRecords<
  AllRecords<Pick<SettingsContributions, Name>, "_value">
>;

// Mutual assignability of both extractions. Read shapes alone would
// miss stored-only drift (`.default()` and `.required()` read the same
// but store differently).
type FieldsMatch<
  A extends readonly MetaBoxFieldInput[],
  B extends readonly MetaBoxFieldInput[],
> = [
  InferFields<A>,
  InferStoredFields<A>,
  InferFields<B>,
  InferStoredFields<B>,
] extends [
  InferFields<B>,
  InferStoredFields<B>,
  InferFields<A>,
  InferStoredFields<A>,
]
  ? true
  : false;

type FieldsDrift<
  O extends { fields: readonly MetaBoxFieldInput[] },
  F extends readonly MetaBoxFieldInput[],
> =
  FieldsMatch<O["fields"], F> extends true
    ? unknown
    : { "drift — fields do not match the declared contribution": F };

/**
 * The compile-time drift check `registerEntryMetaBox` intersects onto
 * its options. With no declaration for `Id` it vanishes (`unknown`);
 * with one, a mismatched target set or field set demands an impossible
 * `"drift — …"` property, failing the call with a readable message.
 * The comparison is over the inferred read + stored shapes, so the
 * registration must pass literally-typed fields (the declared array
 * itself, or an equivalent inline chain) — options widened to the base
 * interface lose the phantoms and fail the check.
 */
export type EntryMetaBoxDrift<
  Id extends string,
  O extends {
    entryTypes: readonly string[];
    fields: readonly MetaBoxFieldInput[];
  },
> = Id extends keyof EntryMetaContributions
  ? EntryMetaContributions[Id] extends {
      entryTypes: infer T extends string;
      fields: infer F extends readonly MetaBoxFieldInput[];
    }
    ? (O["entryTypes"][number] extends T
        ? unknown
        : {
            "drift — entryTypes lists an undeclared entry type": Exclude<
              O["entryTypes"][number],
              T
            >;
          }) &
        ([Exclude<T, O["entryTypes"][number]>] extends [never]
          ? unknown
          : {
              "drift — entryTypes is missing a declared entry type": Exclude<
                T,
                O["entryTypes"][number]
              >;
            }) &
        FieldsDrift<O, F>
    : unknown
  : unknown;

/** The `registerTermMetaBox` analogue of {@link EntryMetaBoxDrift}, over `termTaxonomies`. */
export type TermMetaBoxDrift<
  Id extends string,
  O extends {
    termTaxonomies: readonly string[];
    fields: readonly MetaBoxFieldInput[];
  },
> = Id extends keyof TermMetaContributions
  ? TermMetaContributions[Id] extends {
      termTaxonomies: infer T extends string;
      fields: infer F extends readonly MetaBoxFieldInput[];
    }
    ? (O["termTaxonomies"][number] extends T
        ? unknown
        : {
            "drift — termTaxonomies lists an undeclared taxonomy": Exclude<
              O["termTaxonomies"][number],
              T
            >;
          }) &
        ([Exclude<T, O["termTaxonomies"][number]>] extends [never]
          ? unknown
          : {
              "drift — termTaxonomies is missing a declared taxonomy": Exclude<
                T,
                O["termTaxonomies"][number]
              >;
            }) &
        FieldsDrift<O, F>
    : unknown
  : unknown;

type FieldsOnlyDrift<
  Contributions,
  Key,
  O extends { fields: readonly MetaBoxFieldInput[] },
> = Key extends keyof Contributions
  ? Contributions[Key] extends {
      fields: infer F extends readonly MetaBoxFieldInput[];
    }
    ? FieldsDrift<O, F>
    : unknown
  : unknown;

/** Fields-only drift for `registerUserMetaBox` — users have no target set. */
export type UserMetaBoxDrift<
  Id extends string,
  O extends { fields: readonly MetaBoxFieldInput[] },
> = FieldsOnlyDrift<UserMetaContributions, Id, O>;

/** Fields-only drift for `registerSettingsGroup`, keyed by group name. */
export type SettingsGroupDrift<
  Name extends string,
  O extends { fields: readonly MetaBoxFieldInput[] },
> = FieldsOnlyDrift<SettingsContributions, Name, O>;

/**
 * The entry a targeted template receives: the registered projection
 * with `meta` replaced by the folded typed record. Replacement (not
 * intersection) is what makes a mistyped field name a compile error —
 * intersecting would keep the base open `Record<string, unknown>`
 * index and read typos as `unknown`.
 */
export type ResolvedEntryFor<K extends EntryTypeName> = Omit<
  EntryProjection<K>,
  "meta"
> & { readonly meta: MetaOf<K> };

/** The term a targeted template receives — projection with folded typed meta. */
export type ResolvedTermFor<K extends TermTaxonomyName> = Omit<
  TermProjection<K>,
  "meta"
> & { readonly meta: TermMetaOf<K> };
