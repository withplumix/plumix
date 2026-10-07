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

/** What every builder ends in — the template, whatever selected it. */
interface TemplateSelector<Data extends TemplateData> {
  /** Bind the template for the selection. */
  template(t: TemplateEntry<Data>): TemplateRule;
}

// The per-tier data type is erased on the way into the rule. Each builder types
// its input to the tier's data shape (so `data.entry`/`data.term` are typed at
// the call site), then erases on output — the resolver only ever invokes a
// rule's template with the matching node's data, so the erasure is sound and it
// keeps the `templates` array a homogeneous element type.
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
  // `Array.isArray` widens a `readonly T[]` to `any[]`, so re-assert the element
  // type on the array branch rather than leaning on the narrowing.
  return Array.isArray(templates)
    ? (templates as readonly TemplateRule[])
    : [fallback(templates as TemplateEntry<TemplateData>)];
}

/**
 * Extract the theme's `named` entry templates grouped by entry-type name, for
 * the editor's template picker. Only content (entry) rules are collected —
 * term/author/archive named templates aren't author-selectable per entry.
 * Duplicate ids within a type keep the first declaration (resolution order).
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

// ── Targeted builders ───────────────────────────────────────────────────────
// The selection vocabulary lives in `rule-selectors.ts`, shared with every
// other rule kind declared against the hierarchy. `named` is the exception it
// leaves to us: the id is half a contract with the editor's template picker,
// which writes it to entry meta for `collectNamedTemplates` to read back.

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
  /** Register an author-selectable template, matched from stored entry meta. */
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
  /** Register an author-selectable template, matched from stored term meta. */
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

/**
 * Target author archives. There is a single author "kind" (no registry to
 * autocomplete), so `forAuthor()` takes no name — chain `.slug(...)` / `.id(...)`
 * to narrow to one author, mirroring `forEntryType` / `forTermTaxonomy`. The
 * bare `.template()` matches every author archive (like the `author()` tier).
 */
export function forAuthor(): AuthorBuilder {
  return authorTargets(selector<AuthorArchiveData>);
}

/**
 * Target one date archive. Date components are hierarchical (a month has no
 * meaning without a year), so `forDate` takes them positionally and matches the
 * archive of that exact granularity: `forDate(2026)` → the year archive,
 * `forDate(2026, 7)` → that month, `forDate(2026, 7, 21)` → that day. The
 * generic `date()` tier styles every date archive.
 */
export const forDate: DateTargets<TemplateSelector<DateArchiveData>> =
  dateTargets(selector<DateArchiveData>);

/**
 * Target a plugin-registered archive type (`registerArchiveType`). `name`
 * autocompletes against `ArchiveTypeRegistry` and types the template's `data`
 * from the registered projection — the same shape as `forEntryType` /
 * `forTermTaxonomy`, for archives that live in a plugin rather than core.
 */
export function forArchiveType<K extends ArchiveTypeName>(
  name: K,
): TemplateSelector<ArchiveDataOf<K>> {
  return archiveTypeTargets(name, selector<ArchiveDataOf<K>>);
}

/**
 * Target a plugin-registered view (`registerView`). Any name is accepted; one
 * declared in `ViewRegistry` types the template's `data.data`. A view with no
 * rule of its own renders through `fallback` — views have no generic tier.
 */
export function forView<K extends string>(
  name: K,
): TemplateSelector<ViewDataOf<K>> {
  return viewTargets(name, selector<ViewDataOf<K>>);
}
