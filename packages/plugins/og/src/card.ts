import type {
  ArchiveDataOf,
  ArchiveTypeName,
  AuthorArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeArchiveData,
  EntryTypeName,
  FrontPageData,
  ResolvedEntryFor,
  ResolvedTermFor,
  SearchData,
  TemplateData,
  TemplateDepKey,
  TemplateDepRegistry,
  TemplateRenderArgs,
  TermArchiveData,
  TermTaxonomyName,
} from "plumix";
import type { ResolvedThemeTokens } from "plumix/blocks";
import type {
  AuthorTargets,
  DateTargets,
  EntryTypeTargets,
  TermTaxonomyTargets,
  TierMatchRule,
} from "plumix/plugin";
import {
  archiveTypeTargets,
  authorTargets,
  dateTargets,
  entryTypeTargets,
  termTaxonomyTargets,
} from "plumix/plugin";

import type { CardKey } from "./card-key.js";
import type { CardNode } from "./renderer.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./renderer.js";

/**
 * `tokens` are for decisions made in JavaScript; for styling, `var()` resolves
 * against the same tokens as a stylesheet.
 */
export type CardArgs<TData extends TemplateData> = TemplateRenderArgs<TData> & {
  readonly tokens: ResolvedThemeTokens;
};

/**
 * Which image an entry that has both a generated card and a `.featured()`
 * photo shares — see {@link CardDefinition.mode}.
 */
export type CardMode = "auto" | "card";

// Literal form only: a card has nothing to inherit, so `(prev) => next` would
// have nothing to extend.
type CardDeps = {
  readonly [K in keyof TemplateDepRegistry]?: readonly TemplateDepKey<K>[];
};

export interface CardDefinition<TData extends TemplateData> extends CardDeps {
  /**
   * Must name everything the card reads: a setting, dep or the clock is an
   * input no derivation can see.
   */
  readonly key: (args: CardArgs<TData>) => CardKey;
  readonly render: (args: CardArgs<TData>) => CardNode;
  /**
   * On an entry with a `.featured()` photo, `"auto"` (default) steps aside for
   * the photo cropped to this card's size; `"card"` shares the card anyway.
   */
  readonly mode?: CardMode;
  /** Stylesheets the card's class names are written against. */
  readonly styles?: readonly string[];
  readonly width?: number;
  readonly height?: number;
}

export interface CardSize {
  readonly width: number;
  readonly height: number;
}

/** The one source of size for the storage key, the render and the head. */
export function cardSize(card: CardDefinition<TemplateData>): CardSize {
  return {
    width: card.width ?? CARD_WIDTH,
    height: card.height ?? CARD_HEIGHT,
  };
}

/** Resolved through core's `resolveRule`, exactly like a `templates` entry. */
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

// `named` is left out: it pairs with the editor's template picker, and there is
// no card picker.

type CardEntrySelector<K extends EntryTypeName> = CardSelector<
  EntryData<ResolvedEntryFor<K>>
>;

type CardEntryArchiveSelector<K extends EntryTypeName> = CardSelector<
  EntryTypeArchiveData<ResolvedEntryFor<K>>
>;

type CardTaxonomySelector<K extends TermTaxonomyName> = CardSelector<
  TermArchiveData<ResolvedTermFor<K>>
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
    selector<EntryTypeArchiveData<ResolvedEntryFor<K>>>,
  );
}

interface CardTermTaxonomyBuilder<K extends TermTaxonomyName>
  extends
    CardTaxonomySelector<K>,
    TermTaxonomyTargets<K, CardTaxonomySelector<K>> {}

function forTermTaxonomy<K extends TermTaxonomyName>(
  name: K,
): CardTermTaxonomyBuilder<K> {
  return termTaxonomyTargets(
    name,
    selector<TermArchiveData<ResolvedTermFor<K>>>,
  );
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
 * Mirrors the template builders, except `card.archive()` is the `entryType`
 * tier and `card.taxonomy()` the `term` tier.
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
  /** An entry type's archive listing, any type — the `entryType` tier. */
  archive: (): CardSelector<EntryTypeArchiveData> =>
    selector({ tier: "entryType" }),
  /** A term's archive, any taxonomy — the `term` tier. */
  taxonomy: (): CardSelector<TermArchiveData> => selector({ tier: "term" }),
  /** An author archive, any author. */
  author: (): CardSelector<AuthorArchiveData> => selector({ tier: "author" }),
  /** A date archive, any granularity. */
  date: (): CardSelector<DateArchiveData> => selector({ tier: "date" }),
  /** The front page. */
  frontPage: (): CardSelector<FrontPageData> => selector({ tier: "frontPage" }),
  /** Search results. */
  search: (): CardSelector<SearchData> => selector({ tier: "search" }),
  /**
   * Target a registered entry type — `name` autocompletes and rejects typos.
   */
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
