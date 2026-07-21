import type {
  EntryProjection,
  EntryTypeName,
  MetaOf,
  TermMetaOf,
  TermProjection,
  TermTaxonomyName,
} from "../../template-registry.js";
import type {
  GenericTier,
  TargetMatcher,
  TemplateData,
  TemplateEntry,
  TemplateRule,
  ThemeDescriptor,
} from "../../theme.js";
import type {
  ArchiveData,
  AuthorArchiveData,
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

/** An author archive (any author). */
export function author(
  template: TemplateEntry<AuthorArchiveData>,
): TemplateRule {
  return rule("author", template);
}

/** The static front page. */
export function frontPage(
  template: TemplateEntry<FrontPageData>,
): TemplateRule {
  return rule("frontPage", template);
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

// ── Targeted builders ───────────────────────────────────────────────────────
// `forEntryType`/`forTermTaxonomy` produce match rules keyed off the registered
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

/**
 * Reserved entry-meta key holding an author's `named`-template choice — the
 * editor writes it, the resolver reads it. Part of the `__plumix_*` namespace.
 */
export const NAMED_TEMPLATE_META_KEY = "__plumix_template";

/** A predicate matching when a content entry's meta value equals `value`. */
function metaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "entry" in data && data.entry.meta[key] === value;
}

/** A predicate matching when a resolved term's meta value equals `value`. */
function termMetaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "term" in data && data.term.meta[key] === value;
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
  /** Narrow by an entry-meta value, typed against the type's meta projection. */
  whereMeta<M extends keyof MetaOf<K>>(
    key: M,
    value: MetaOf<K>[M],
  ): EntrySelector<K>;
  /** Narrow by an arbitrary predicate over the resolved data. */
  where(
    predicate: (data: EntryData<EntryProjection<K>>) => boolean,
  ): EntrySelector<K>;
  /** Register an author-selectable template, matched from stored entry meta. */
  named(id: string, label: string): EntrySelector<K>;
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
  // Each selector adds its narrowing to the shared content-node prefix.
  const content = (extra?: Partial<TargetMatcher>): EntrySelector<K> => ({
    template: (t) =>
      matchRule({ nodeKind: "content", type: name, ...extra }, t),
  });
  return {
    template: (t) => matchRule({ nodeKind: "content", type: name }, t),
    slug: (slug) => content({ slug }),
    id: (id) => content({ id }),
    whereMeta: (key, value) =>
      content({ predicate: metaEquals(String(key), value) }),
    where: (predicate) =>
      content({
        predicate: predicate as unknown as (d: TemplateData) => boolean,
      }),
    named: (id, label) =>
      content({
        named: { id, label },
        predicate: metaEquals(NAMED_TEMPLATE_META_KEY, id),
      }),
    archive: {
      template: (t) =>
        matchRule({ nodeKind: "content-type-archive", type: name }, t),
    },
  };
}

interface TaxonomySelector<K extends TermTaxonomyName> {
  /** Bind the template for the selected term(s). */
  template(t: TemplateEntry<TaxonomyData<TermProjection<K>>>): TemplateRule;
}

interface TermTaxonomyBuilder<
  K extends TermTaxonomyName,
> extends TaxonomySelector<K> {
  /** Narrow to one term by slug. */
  slug(slug: string): TaxonomySelector<K>;
  /** Narrow to one term by numeric id. */
  id(id: number): TaxonomySelector<K>;
  /** Narrow by a term-meta value, typed against the taxonomy's meta projection. */
  whereMeta<M extends keyof TermMetaOf<K>>(
    key: M,
    value: TermMetaOf<K>[M],
  ): TaxonomySelector<K>;
  /** Narrow by an arbitrary predicate over the resolved taxonomy data. */
  where(
    predicate: (data: TaxonomyData<TermProjection<K>>) => boolean,
  ): TaxonomySelector<K>;
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
  // Each selector adds its narrowing to the shared term-node prefix.
  const term = (extra?: Partial<TargetMatcher>): TaxonomySelector<K> => ({
    template: (t) => matchRule({ nodeKind: "term", type: name, ...extra }, t),
  });
  return {
    template: (t) => matchRule({ nodeKind: "term", type: name }, t),
    slug: (slug) => term({ slug }),
    id: (id) => term({ id }),
    whereMeta: (key, value) =>
      term({ predicate: termMetaEquals(String(key), value) }),
    where: (predicate) =>
      term({
        predicate: predicate as unknown as (d: TemplateData) => boolean,
      }),
    named: (id, label) =>
      term({
        named: { id, label },
        predicate: termMetaEquals(NAMED_TEMPLATE_META_KEY, id),
      }),
  };
}

interface AuthorSelector {
  /** Bind the template for the selected author. */
  template(t: TemplateEntry<AuthorArchiveData>): TemplateRule;
}

interface AuthorBuilder extends AuthorSelector {
  /** Narrow to one author by slug. */
  slug(slug: string): AuthorSelector;
  /** Narrow to one author by numeric id. */
  id(id: number): AuthorSelector;
}

/**
 * Target author archives. There is a single author "kind" (no registry to
 * autocomplete), so `forAuthor()` takes no name — chain `.slug(...)` / `.id(...)`
 * to narrow to one author, mirroring `forEntryType` / `forTermTaxonomy`. The
 * bare `.template()` matches every author archive (like the `author()` tier).
 */
export function forAuthor(): AuthorBuilder {
  // Each selector adds its narrowing to the shared author-node prefix.
  const authorNode = (extra?: Partial<TargetMatcher>): AuthorSelector => ({
    template: (t) =>
      matchRule({ nodeKind: "author", type: "author", ...extra }, t),
  });
  return {
    template: (t) => matchRule({ nodeKind: "author", type: "author" }, t),
    slug: (slug) => authorNode({ slug }),
    id: (id) => authorNode({ id }),
  };
}
