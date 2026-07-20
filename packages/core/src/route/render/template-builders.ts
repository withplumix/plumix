import type {
  EntryProjection,
  EntryTypeName,
  TaxonomyName,
  TermProjection,
} from "../../template-registry.js";
import type {
  GenericTier,
  TargetMatcher,
  TemplateData,
  TemplateEntry,
  TemplateRule,
} from "../../theme.js";
import type {
  ArchiveData,
  EntryData,
  ErrorData,
  FrontPageData,
  SearchData,
  TaxonomyData,
} from "./resolved-entry.js";

// The per-tier data type is erased to the union in the stored rule. Each
// builder types its input to the tier's data shape (so `data.entry`/`data.term`
// are typed at the call site), then erases on output — the resolver only ever
// invokes a rule's template with the matching node's data, so the erasure is
// sound and it keeps the `templates` array a homogeneous element type.
function rule<Data extends TemplateData>(
  tier: GenericTier,
  template: TemplateEntry<Data>,
): TemplateRule {
  return { tier, template: template as unknown as TemplateEntry<TemplateData> };
}

/** Universal catch-all — matches any resolved node. */
export function fallback(template: TemplateEntry<TemplateData>): TemplateRule {
  return rule("fallback", template);
}

/** A single entry (any type). */
export function entry(template: TemplateEntry<EntryData>): TemplateRule {
  return rule("entry", template);
}

/** A content-type archive listing. */
export function archive(template: TemplateEntry<ArchiveData>): TemplateRule {
  return rule("archive", template);
}

/** A term archive (any taxonomy). */
export function taxonomy(template: TemplateEntry<TaxonomyData>): TemplateRule {
  return rule("taxonomy", template);
}

/** The static front page. */
export function frontPage(
  template: TemplateEntry<FrontPageData>,
): TemplateRule {
  return rule("frontPage", template);
}

/** The posts listing (blog home). */
export function postsPage(
  template: TemplateEntry<FrontPageData>,
): TemplateRule {
  return rule("postsPage", template);
}

/** Search results. */
export function search(template: TemplateEntry<SearchData>): TemplateRule {
  return rule("search", template);
}

/** The 404 handler. */
export function notFound(template: TemplateEntry<ErrorData>): TemplateRule {
  return rule("notFound", template);
}

/** The 500 handler. */
export function serverError(template: TemplateEntry<ErrorData>): TemplateRule {
  return rule("serverError", template);
}

// ── Targeted builders ───────────────────────────────────────────────────────
// `forEntryType`/`forTaxonomy` produce match rules keyed off the registered
// names. Each selector types the template to the tier's data shape (with the
// registry projection) and erases to the union like the generic builders above.

function matchRule<Data extends TemplateData>(
  match: TargetMatcher,
  template: TemplateEntry<Data>,
): TemplateRule {
  return {
    match,
    template: template as unknown as TemplateEntry<TemplateData>,
  };
}

interface EntrySelector<K extends EntryTypeName> {
  /** Bind the template for the selected entry. */
  template(t: TemplateEntry<EntryData<EntryProjection<K>>>): TemplateRule;
}

interface EntryTypeBuilder<K extends EntryTypeName> extends EntrySelector<K> {
  /** Narrow to one entry by slug. */
  slug(slug: string): EntrySelector<K>;
  /** Narrow to one entry by numeric id. */
  id(id: number): EntrySelector<K>;
  /** The content-type archive listing. */
  readonly archive: {
    template(t: TemplateEntry<ArchiveData<EntryProjection<K>>>): TemplateRule;
  };
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
    template: (t) => matchRule({ nodeKind: "content", type: name }, t),
    slug: (slug) => ({
      template: (t) => matchRule({ nodeKind: "content", type: name, slug }, t),
    }),
    id: (id) => ({
      template: (t) => matchRule({ nodeKind: "content", type: name, id }, t),
    }),
    archive: {
      template: (t) =>
        matchRule({ nodeKind: "content-type-archive", type: name }, t),
    },
  };
}

interface TaxonomySelector<K extends TaxonomyName> {
  /** Bind the template for the selected term(s). */
  template(t: TemplateEntry<TaxonomyData<TermProjection<K>>>): TemplateRule;
}

interface TaxonomyBuilder<K extends TaxonomyName> extends TaxonomySelector<K> {
  /** Narrow to one term by slug. */
  slug(slug: string): TaxonomySelector<K>;
  /** Narrow to one term by numeric id. */
  id(id: number): TaxonomySelector<K>;
}

/**
 * Target a registered taxonomy. `name` autocompletes and rejects typos; the
 * template's `data.term` is typed from the taxonomy's term projection.
 */
export function forTaxonomy<K extends TaxonomyName>(
  name: K,
): TaxonomyBuilder<K> {
  return {
    template: (t) => matchRule({ nodeKind: "term", type: name }, t),
    slug: (slug) => ({
      template: (t) => matchRule({ nodeKind: "term", type: name, slug }, t),
    }),
    id: (id) => ({
      template: (t) => matchRule({ nodeKind: "term", type: name, id }, t),
    }),
  };
}
