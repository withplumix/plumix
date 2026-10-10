import type {
  ResolvedEntryFor,
  ResolvedTermFor,
} from "../../plugin/fields/contributions.js";
import type {
  ArchiveDataOf,
  ArchiveTypeName,
  EntryTypeName,
  TermTaxonomyName,
  ViewDataOf,
} from "../../template-registry.js";
import type {
  GenericTier,
  TemplateData,
  TemplateEntry,
  TemplateRule,
  ThemeDescriptor,
  TierMatchRule,
} from "../../theme.js";
import type { NamedTemplateChoice } from "../contract/named-template.js";
import type {
  AuthorArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeArchiveData,
  ErrorData,
  FrontPageData,
  SearchData,
  TermArchiveData,
} from "../contract/resolved-entry.js";
import type {
  AuthorTargets,
  DateTargets,
  EntryTypeTargets,
  TermTaxonomyTargets,
} from "./rule-selectors.js";
import { NAMED_TEMPLATE_META_KEY } from "../contract/named-template.js";
import {
  archiveTypeTargets,
  authorTargets,
  dateTargets,
  entryTypeMatch,
  entryTypeTargets,
  metaEquals,
  termMetaEquals,
  termTaxonomyMatch,
  termTaxonomyTargets,
  viewTargets,
} from "./rule-selectors.js";

export { NAMED_TEMPLATE_META_KEY };

interface TemplateSelector<Data extends TemplateData> {
  template(t: TemplateEntry<Data>): TemplateRule;
}

// Erasing the per-tier data type is sound: the resolver only invokes a template
// with its matching node's data.
function selector<Data extends TemplateData>(
  where: TierMatchRule,
): TemplateSelector<Data> {
  return {
    template: (t) => ({
      ...where,
      // Safety: `where` is what confines this rule to nodes carrying `Data`, so
      // the erased parameter is restored before the template is ever called.
      template: t as unknown as TemplateEntry<TemplateData>,
    }),
  };
}

function tierRule<Data extends TemplateData>(
  tier: GenericTier,
  template: TemplateEntry<Data>,
): TemplateRule {
  return selector<Data>({ tier }).template(template);
}

/** Universal catch-all — matches any resolved node. */
export function fallback(template: TemplateEntry<TemplateData>): TemplateRule {
  return tierRule("fallback", template);
}

/** A single entry (any type). */
export function entry(template: TemplateEntry<EntryData>): TemplateRule {
  return tierRule("entry", template);
}

/** An entry type's archive listing (any entry type). */
export function entryType(
  template: TemplateEntry<EntryTypeArchiveData>,
): TemplateRule {
  return tierRule("entryType", template);
}

/** A term's archive (any taxonomy). */
export function term(template: TemplateEntry<TermArchiveData>): TemplateRule {
  return tierRule("term", template);
}

/** An author archive (any author). */
export function author(
  template: TemplateEntry<AuthorArchiveData>,
): TemplateRule {
  return tierRule("author", template);
}

/** A date archive (any year/month/day). */
export function date(template: TemplateEntry<DateArchiveData>): TemplateRule {
  return tierRule("date", template);
}

/** The static front page. */
export function frontPage(
  template: TemplateEntry<FrontPageData>,
): TemplateRule {
  return tierRule("frontPage", template);
}

/** Search results. */
export function search(template: TemplateEntry<SearchData>): TemplateRule {
  return tierRule("search", template);
}

/** The 404 handler. */
export function notFound(template: TemplateEntry<ErrorData>): TemplateRule {
  return tierRule("notFound", template);
}

/** The 500 handler. */
export function serverError(template: TemplateEntry<ErrorData>): TemplateRule {
  return tierRule("serverError", template);
}

/**
 * Normalize a theme's `templates` to a rule array — the array form as-is, or a
 * bare component wrapped as the fallback tier.
 */
export function templateRules(
  templates: ThemeDescriptor["templates"],
): readonly TemplateRule[] {
  // `Array.isArray` widens a `readonly T[]` to `any[]`, so re-assert the
  // element type on the array branch rather than leaning on the narrowing.
  return Array.isArray(templates)
    ? (templates as readonly TemplateRule[])
    : [fallback(templates as TemplateEntry<TemplateData>)];
}

/**
 * Entry rules only. A duplicate id within a type keeps the first declaration,
 * matching resolution order.
 */
export function collectNamedTemplates(
  templates: ThemeDescriptor["templates"],
): Record<string, readonly NamedTemplateChoice[]> {
  const out: Record<string, NamedTemplateChoice[]> = {};
  for (const rule of templateRules(templates)) {
    const match = rule.match;
    if (!match?.named || match.nodeKind !== "entry" || !match.type) continue;
    const named = match.named;
    const list = (out[match.type] ??= []);
    if (list.some((c) => c.id === named.id)) continue;
    list.push({ id: named.id, label: named.label });
  }
  return out;
}

// `named` lives here, not in `rule-selectors.ts`: its id is half a contract
// with the editor's template picker.

type EntrySelector<K extends EntryTypeName> = TemplateSelector<
  EntryData<ResolvedEntryFor<K>>
>;

type EntryArchiveSelector<K extends EntryTypeName> = TemplateSelector<
  EntryTypeArchiveData<ResolvedEntryFor<K>>
>;

type TaxonomySelector<K extends TermTaxonomyName> = TemplateSelector<
  TermArchiveData<ResolvedTermFor<K>>
>;

interface EntryTypeBuilder<K extends EntryTypeName>
  extends
    EntrySelector<K>,
    EntryTypeTargets<K, EntrySelector<K>, EntryArchiveSelector<K>> {
  /** Matched from stored entry meta. */
  named(id: string, label: string): EntrySelector<K>;
}

/**
 * Target a registered entry type. `name` autocompletes and rejects typos
 * (`keyof EntryTypeRegistry`); the template's `data.entry` is typed from the
 * type's projection.
 */
export function forEntryType<K extends EntryTypeName>(
  name: K,
): EntryTypeBuilder<K> {
  return {
    ...entryTypeTargets(
      name,
      selector<EntryData<ResolvedEntryFor<K>>>,
      selector<EntryTypeArchiveData<ResolvedEntryFor<K>>>,
    ),
    named: (id, label) =>
      selector<EntryData<ResolvedEntryFor<K>>>(
        entryTypeMatch(name, {
          named: { id, label },
          predicate: metaEquals(NAMED_TEMPLATE_META_KEY, id),
        }),
      ),
  };
}

interface TermTaxonomyBuilder<K extends TermTaxonomyName>
  extends TaxonomySelector<K>, TermTaxonomyTargets<K, TaxonomySelector<K>> {
  /** Matched from stored term meta. */
  named(id: string, label: string): TaxonomySelector<K>;
}

/**
 * Target a registered taxonomy. `name` autocompletes and rejects typos; the
 * template's `data.term` is typed from the taxonomy's term projection.
 */
export function forTermTaxonomy<K extends TermTaxonomyName>(
  name: K,
): TermTaxonomyBuilder<K> {
  return {
    ...termTaxonomyTargets(name, selector<TermArchiveData<ResolvedTermFor<K>>>),
    named: (id, label) =>
      selector<TermArchiveData<ResolvedTermFor<K>>>(
        termTaxonomyMatch(name, {
          named: { id, label },
          predicate: termMetaEquals(NAMED_TEMPLATE_META_KEY, id),
        }),
      ),
  };
}

interface AuthorBuilder
  extends
    TemplateSelector<AuthorArchiveData>,
    AuthorTargets<TemplateSelector<AuthorArchiveData>> {}

/** The bare `.template()` matches every author archive. */
export function forAuthor(): AuthorBuilder {
  return authorTargets(selector<AuthorArchiveData>);
}

/**
 * Matches exact granularity: `forDate(2026)` is the year archive only, not its
 * months or days.
 */
export const forDate: DateTargets<TemplateSelector<DateArchiveData>> =
  dateTargets(selector<DateArchiveData>);

/** Targets a `registerArchiveType` archive. */
export function forArchiveType<K extends ArchiveTypeName>(
  name: K,
): TemplateSelector<ArchiveDataOf<K>> {
  return archiveTypeTargets(name, selector<ArchiveDataOf<K>>);
}

/**
 * Any name is accepted. A view with no rule renders through `fallback`: views
 * have no generic tier.
 */
export function forView<K extends string>(
  name: K,
): TemplateSelector<ViewDataOf<K>> {
  return viewTargets(name, selector<ViewDataOf<K>>);
}
