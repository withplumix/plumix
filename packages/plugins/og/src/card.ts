import type {
  ArchiveData,
  ArchiveDataOf,
  ArchiveTypeName,
  AuthorArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeName,
  FrontPageData,
  ResolvedEntryFor,
  ResolvedTermFor,
  SearchData,
  StoredMetaOf,
  StoredTermMetaOf,
  TargetMatcher,
  TaxonomyData,
  TemplateData,
  TemplateDepRegistry,
  TemplateRenderArgs,
  TermTaxonomyName,
  TierMatchRule,
} from "plumix";

import type { CardKey } from "./card-key.js";
import type { CardNode } from "./renderer.js";

/** A card's render arguments, which are a template's render arguments. */
export type CardArgs<TData extends TemplateData> = TemplateRenderArgs<TData>;

/**
 * Template deps a card declares. Only the literal form: a card is not
 * inherited from, so the `(prev) => next` form templates use to extend what
 * their theme declared would have nothing to extend.
 */
type CardDeps = {
  readonly [
    K in keyof TemplateDepRegistry
  ]?: readonly TemplateDepRegistry[K]["slug"][];
};

export interface CardDefinition<TData extends TemplateData> extends CardDeps {
  /**
   * Everything the card reads, named. Required rather than derived: a card
   * reading a setting, a dep or the clock has an input no derivation can see,
   * and the type system cannot say which. {@link CardKey} helpers keep the
   * common case to one line and emit the URL hash and the cache tag together.
   */
  readonly key: (args: CardArgs<TData>) => CardKey;
  readonly render: (args: CardArgs<TData>) => CardNode;
  /** Stylesheets the card's class names are written against. */
  readonly styles?: readonly string[];
  readonly width?: number;
  readonly height?: number;
}

/**
 * One entry in a theme's `ogCards` array: a card bound to either a generic
 * `tier` or a targeted `match`, exactly like a `templates` entry. Resolution
 * therefore runs through core's `resolveRule` rather than a second walk.
 */
export interface CardRule extends TierMatchRule {
  readonly card: CardDefinition<TemplateData>;
}

declare module "plumix" {
  interface ThemeDescriptor {
    /**
     * Social cards, per page kind, in the vocabulary `templates` already uses.
     * Declared here so swapping the theme swaps its cards with it.
     */
    readonly ogCards?: readonly CardRule[];
  }
}

/** What every builder ends in — the card itself, whatever selected it. */
export interface CardSelector<TData extends TemplateData> {
  define(definition: CardDefinition<TData>): CardRule;
}

// The per-tier data type is erased on the way into the rule, the way the
// template builders erase theirs: the resolver only ever hands a rule the data
// of the node whose tier it was built for, so `TData` is restored before either
// callback is called, and `ogCards` stays a homogeneous array.
function selector<TData extends TemplateData>(
  where: TierMatchRule,
): CardSelector<TData> {
  return {
    define: (definition) => ({
      ...where,
      // Safety: `where` is what confines this rule to nodes carrying `TData`.
      card: definition as unknown as CardDefinition<TemplateData>,
    }),
  };
}

interface CardEntryTypeBuilder<K extends EntryTypeName> extends CardSelector<
  EntryData<ResolvedEntryFor<K>>
> {
  /** Narrow to one entry by slug. */
  slug(slug: string): CardSelector<EntryData<ResolvedEntryFor<K>>>;
  /** Narrow to one entry by numeric id. */
  id(id: number): CardSelector<EntryData<ResolvedEntryFor<K>>>;
  /** Narrow by an entry-meta value, typed against the type's stored meta shape. */
  whereMeta<M extends keyof StoredMetaOf<K>>(
    key: M,
    value: StoredMetaOf<K>[M],
  ): CardSelector<EntryData<ResolvedEntryFor<K>>>;
  /** Narrow by an arbitrary predicate over the resolved data. */
  where(
    predicate: (data: EntryData<ResolvedEntryFor<K>>) => boolean,
  ): CardSelector<EntryData<ResolvedEntryFor<K>>>;
  /** The type's archive listing. */
  readonly archive: CardSelector<ArchiveData<ResolvedEntryFor<K>>>;
}

interface CardTermTaxonomyBuilder<
  K extends TermTaxonomyName,
> extends CardSelector<TaxonomyData<ResolvedTermFor<K>>> {
  /** Narrow to one term by slug. */
  slug(slug: string): CardSelector<TaxonomyData<ResolvedTermFor<K>>>;
  /** Narrow to one term by numeric id. */
  id(id: number): CardSelector<TaxonomyData<ResolvedTermFor<K>>>;
  /** Narrow by a term-meta value, typed against the taxonomy's stored meta shape. */
  whereMeta<M extends keyof StoredTermMetaOf<K>>(
    key: M,
    value: StoredTermMetaOf<K>[M],
  ): CardSelector<TaxonomyData<ResolvedTermFor<K>>>;
  /** Narrow by an arbitrary predicate over the resolved taxonomy data. */
  where(
    predicate: (data: TaxonomyData<ResolvedTermFor<K>>) => boolean,
  ): CardSelector<TaxonomyData<ResolvedTermFor<K>>>;
}

interface CardAuthorBuilder extends CardSelector<AuthorArchiveData> {
  /** Narrow to one author by slug. */
  slug(slug: string): CardSelector<AuthorArchiveData>;
  /** Narrow to one author by numeric id. */
  id(id: number): CardSelector<AuthorArchiveData>;
}

function metaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "entry" in data && data.entry.meta[key] === value;
}

function termMetaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "term" in data && data.term.meta[key] === value;
}

function forEntryType<K extends EntryTypeName>(
  name: K,
): CardEntryTypeBuilder<K> {
  const content = (
    extra?: Partial<TargetMatcher>,
  ): CardSelector<EntryData<ResolvedEntryFor<K>>> =>
    selector({ match: { nodeKind: "content", type: name, ...extra } });
  return {
    ...content(),
    slug: (slug) => content({ slug }),
    id: (id) => content({ id }),
    whereMeta: (key, value) =>
      content({ predicate: metaEquals(String(key), value) }),
    where: (predicate) =>
      content({
        // Safety: the surrounding matcher pins `nodeKind` and `type`, so the
        // resolver only calls this predicate with the entry data it was
        // written against.
        predicate: predicate as unknown as (d: TemplateData) => boolean,
      }),
    archive: selector({
      match: { nodeKind: "content-type-archive", type: name },
    }),
  };
}

function forTermTaxonomy<K extends TermTaxonomyName>(
  name: K,
): CardTermTaxonomyBuilder<K> {
  const term = (
    extra?: Partial<TargetMatcher>,
  ): CardSelector<TaxonomyData<ResolvedTermFor<K>>> =>
    selector({ match: { nodeKind: "term", type: name, ...extra } });
  return {
    ...term(),
    slug: (slug) => term({ slug }),
    id: (id) => term({ id }),
    whereMeta: (key, value) =>
      term({ predicate: termMetaEquals(String(key), value) }),
    where: (predicate) =>
      term({
        // Safety: the surrounding matcher pins `nodeKind` and `type`, so the
        // resolver only calls this predicate with the term data it was written
        // against.
        predicate: predicate as unknown as (d: TemplateData) => boolean,
      }),
  };
}

function forAuthor(): CardAuthorBuilder {
  const authorNode = (
    extra?: Partial<TargetMatcher>,
  ): CardSelector<AuthorArchiveData> =>
    selector({ match: { nodeKind: "author", type: "author", ...extra } });
  return {
    ...authorNode(),
    slug: (slug) => authorNode({ slug }),
    id: (id) => authorNode({ id }),
  };
}

function forDate(year: number): CardSelector<DateArchiveData>;
function forDate(year: number, month: number): CardSelector<DateArchiveData>;
function forDate(
  year: number,
  month: number,
  day: number,
): CardSelector<DateArchiveData>;
function forDate(
  year: number,
  month?: number,
  day?: number,
): CardSelector<DateArchiveData> {
  return selector({
    match: {
      nodeKind: "date",
      type: "date",
      year,
      ...(month !== undefined ? { month } : {}),
      ...(day !== undefined ? { day } : {}),
    },
  });
}

/**
 * Builders for a theme's `ogCards`, mirroring the template builders one for
 * one: a generic tier (`card.entry()`, `card.frontPage()`, `card.fallback()`)
 * or a targeted matcher (`card.forEntryType("post")`), then `.define(...)`.
 *
 * @example
 * ```ts
 * defineTheme({
 *   templates: [...],
 *   ogCards: [
 *     card.forEntryType("post").define({
 *       key: ({ data }) => cardKey.entry(data.entry),
 *       render: ({ data }) => ({ type: "text", text: data.entry.title }),
 *     }),
 *     card.fallback().define({ key: ..., render: ... }),
 *   ],
 * });
 * ```
 */
export const card = {
  /** Universal catch-all — matches any resolved node. */
  fallback: (): CardSelector<TemplateData> => selector({ tier: "fallback" }),
  /** A single entry, any type. */
  entry: (): CardSelector<EntryData> => selector({ tier: "entry" }),
  /** A content-type archive listing, any type. */
  archive: (): CardSelector<ArchiveData> => selector({ tier: "archive" }),
  /** A term archive, any taxonomy. */
  taxonomy: (): CardSelector<TaxonomyData> => selector({ tier: "taxonomy" }),
  /** An author archive, any author. */
  author: (): CardSelector<AuthorArchiveData> => selector({ tier: "author" }),
  /** A date archive, any granularity. */
  date: (): CardSelector<DateArchiveData> => selector({ tier: "date" }),
  /** The front page. */
  frontPage: (): CardSelector<FrontPageData> => selector({ tier: "frontPage" }),
  /** Search results. */
  search: (): CardSelector<SearchData> => selector({ tier: "search" }),
  /** Target a registered entry type — `name` autocompletes and rejects typos. */
  forEntryType,
  /** Target a registered taxonomy — `name` autocompletes and rejects typos. */
  forTermTaxonomy,
  /** Target author archives; chain `.slug(...)` / `.id(...)` to narrow. */
  forAuthor,
  /** Target one date archive at the granularity the arguments give. */
  forDate,
  /** Target a plugin-registered archive type (`registerArchiveType`). */
  forArchiveType: <K extends ArchiveTypeName>(
    name: K,
  ): CardSelector<ArchiveDataOf<K>> =>
    selector({ match: { nodeKind: "custom", type: name } }),
};
