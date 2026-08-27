import type {
  ArchiveData,
  ArchiveDataOf,
  ArchiveTypeName,
  AuthorArchiveData,
  AuthorTargets,
  DateArchiveData,
  DateTargets,
  EntryData,
  EntryTypeName,
  EntryTypeTargets,
  FrontPageData,
  ResolvedEntryFor,
  ResolvedTermFor,
  SearchData,
  TaxonomyData,
  TemplateData,
  TemplateDepRegistry,
  TemplateRenderArgs,
  TermTaxonomyName,
  TermTaxonomyTargets,
  TierMatchRule,
} from "plumix";
import type { ResolvedThemeTokens } from "plumix/blocks";
import {
  archiveTypeTargets,
  authorTargets,
  dateTargets,
  entryTypeTargets,
  termTaxonomyTargets,
} from "plumix";

import type { CardKey } from "./card-key.js";
import type { CardNode } from "./renderer.js";

/**
 * A card's render arguments: a template's render arguments, plus the theme's
 * tokens resolved to values for the decisions a card makes in JavaScript.
 * Styling goes through CSS — the same tokens reach the renderer as a
 * stylesheet, so a card's `var()` references resolve without passing through
 * here.
 */
export type CardArgs<TData extends TemplateData> = TemplateRenderArgs<TData> & {
  readonly tokens: ResolvedThemeTokens;
};

/**
 * Which image an entry that has both a generated card and a `.featured()`
 * photo shares — see {@link CardDefinition.mode}.
 */
export type CardMode = "auto" | "card";

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
  /**
   * What this card does on an entry that carries a `.featured()` photo.
   * `"auto"` — the default, and the same as leaving this out — steps aside for
   * the photo, cropped to this card's own size. `"card"` shares the card
   * anyway, for a theme whose share image is branded rather than the picture.
   *
   * A setting rather than a flag because a per-entry select will later refine
   * this same one, rather than open a second precedence authority beside it.
   */
  readonly mode?: CardMode;
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
// template builders erase theirs, so `ogCards` stays a homogeneous array.
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

// The narrowings below come from core's shared selection vocabulary — the same
// one the template builders compose — so a matcher core adds or fixes reaches
// cards without being mirrored here. `named` is not among them: it is half a
// contract with the editor's template picker, and there is no card picker.

type CardEntrySelector<K extends EntryTypeName> = CardSelector<
  EntryData<ResolvedEntryFor<K>>
>;

type CardEntryArchiveSelector<K extends EntryTypeName> = CardSelector<
  ArchiveData<ResolvedEntryFor<K>>
>;

type CardTaxonomySelector<K extends TermTaxonomyName> = CardSelector<
  TaxonomyData<ResolvedTermFor<K>>
>;

interface CardEntryTypeBuilder<K extends EntryTypeName>
  extends
    CardEntrySelector<K>,
    EntryTypeTargets<K, CardEntrySelector<K>, CardEntryArchiveSelector<K>> {}

function forEntryType<K extends EntryTypeName>(
  name: K,
): CardEntryTypeBuilder<K> {
  return entryTypeTargets(
    name,
    selector<EntryData<ResolvedEntryFor<K>>>,
    selector<ArchiveData<ResolvedEntryFor<K>>>,
  );
}

interface CardTermTaxonomyBuilder<K extends TermTaxonomyName>
  extends
    CardTaxonomySelector<K>,
    TermTaxonomyTargets<K, CardTaxonomySelector<K>> {}

function forTermTaxonomy<K extends TermTaxonomyName>(
  name: K,
): CardTermTaxonomyBuilder<K> {
  return termTaxonomyTargets(name, selector<TaxonomyData<ResolvedTermFor<K>>>);
}

interface CardAuthorBuilder
  extends
    CardSelector<AuthorArchiveData>,
    AuthorTargets<CardSelector<AuthorArchiveData>> {}

function forAuthor(): CardAuthorBuilder {
  return authorTargets(selector<AuthorArchiveData>);
}

const forDate: DateTargets<CardSelector<DateArchiveData>> = dateTargets(
  selector<DateArchiveData>,
);

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
    archiveTypeTargets(name, selector<ArchiveDataOf<K>>),
};
