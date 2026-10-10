import type {
  ResolvedEntryFor,
  ResolvedTermFor,
  StoredMetaOf,
  StoredTermMetaOf,
} from "../../plugin/fields/contributions.js";
import type {
  EntryTypeName,
  TermTaxonomyName,
} from "../../template-registry.js";
import type {
  TargetMatcher,
  TemplateData,
  TierMatchRule,
} from "../../theme.js";
import type { EntryData, TermArchiveData } from "../contract/resolved-entry.js";

/**
 * Must return a fresh object literal with only its terminal: it is spread, so
 * inherited methods drop and narrowing-named keys get overwritten.
 */
export type BindRule<S> = (where: TierMatchRule) => S;

/** What a `*Match` constructor accepts on top of the prefix it mints. */
export type MatchNarrowing = Omit<Partial<TargetMatcher>, "nodeKind" | "type">;

/** `extra` cannot override `nodeKind` or `type`. */
export function entryTypeMatch(
  name: EntryTypeName,
  extra?: MatchNarrowing,
): TierMatchRule {
  return { match: { nodeKind: "entry", type: name, ...extra } };
}

/** The match a taxonomy selector narrows from. */
export function termTaxonomyMatch(
  name: TermTaxonomyName,
  extra?: MatchNarrowing,
): TierMatchRule {
  return { match: { nodeKind: "term", type: name, ...extra } };
}

/**
 * Compares `entry.storedMeta`, not the decoded `entry.meta`. False for a term.
 */
export function metaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "entry" in data && data.entry.storedMeta[key] === value;
}

/**
 * Reads `storedMeta`: the decoded `term.meta` holds `Date`s and hydrated
 * references `===` can't match.
 */
export function termMetaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "term" in data && data.term.storedMeta[key] === value;
}

/** Narrowings an entry-type selector accepts, plus the type's archive. */
export interface EntryTypeTargets<K extends EntryTypeName, SEntry, SArchive> {
  /** Narrow to one entry by slug. */
  slug(slug: string): SEntry;
  /** Narrow to one entry by numeric id. */
  id(id: number): SEntry;
  /**
   * Narrow by an entry-meta value, typed against the type's folded stored meta
   * shape and compared against `entry.storedMeta`, which is that same shape.
   */
  whereMeta<M extends keyof StoredMetaOf<K>>(
    key: M,
    value: StoredMetaOf<K>[M],
  ): SEntry;
  /** Narrow by an arbitrary predicate over the resolved data. */
  where(predicate: (data: EntryData<ResolvedEntryFor<K>>) => boolean): SEntry;
  /** An entry type's archive listing. */
  readonly archive: SArchive;
}

/** Narrowings a taxonomy selector accepts. */
export interface TermTaxonomyTargets<K extends TermTaxonomyName, STerm> {
  /** Narrow to one term by slug. */
  slug(slug: string): STerm;
  /** Narrow to one term by numeric id. */
  id(id: number): STerm;
  /**
   * Narrow by a term-meta value, typed against the taxonomy's folded stored
   * meta shape.
   */
  whereMeta<M extends keyof StoredTermMetaOf<K>>(
    key: M,
    value: StoredTermMetaOf<K>[M],
  ): STerm;
  /** Narrow by an arbitrary predicate over the resolved taxonomy data. */
  where(
    predicate: (data: TermArchiveData<ResolvedTermFor<K>>) => boolean,
  ): STerm;
}

/** Narrowings an author selector accepts. */
export interface AuthorTargets<S> {
  /** Narrow to one author by slug. */
  slug(slug: string): S;
  /** Narrow to one author by numeric id. */
  id(id: number): S;
}

/**
 * Overloads rather than optional parameters, so `(2026, undefined, 5)` is
 * rejected.
 */
export interface DateTargets<S> {
  (year: number): S;
  (year: number, month: number): S;
  (year: number, month: number, day: number): S;
}

/**
 * Entries of one registered type, and that type's archive. `bindArchive` is
 * separate because `.archive` selects a different node kind, carrying a
 * different data shape.
 */
export function entryTypeTargets<
  K extends EntryTypeName,
  SEntry extends object,
  SArchive,
>(
  name: K,
  bindEntry: BindRule<SEntry>,
  bindArchive: BindRule<SArchive>,
): SEntry & EntryTypeTargets<K, SEntry, SArchive> {
  const content = (extra?: MatchNarrowing): SEntry =>
    bindEntry(entryTypeMatch(name, extra));
  return {
    ...content(),
    slug: (slug: string) => content({ slug }),
    id: (id: number) => content({ id }),
    whereMeta: (key: keyof StoredMetaOf<K>, value: unknown) =>
      content({ predicate: metaEquals(String(key), value) }),
    where: (predicate: (data: EntryData<ResolvedEntryFor<K>>) => boolean) =>
      content({
        // Safety: the surrounding matcher pins `nodeKind` and `type`, so the
        // resolver only calls this predicate with the entry data it was
        // written against.
        predicate: predicate as unknown as (d: TemplateData) => boolean,
      }),
    archive: bindArchive({
      match: { nodeKind: "entryType", type: name },
    }),
  };
}

/** Terms of one registered taxonomy. */
export function termTaxonomyTargets<
  K extends TermTaxonomyName,
  STerm extends object,
>(name: K, bindTerm: BindRule<STerm>): STerm & TermTaxonomyTargets<K, STerm> {
  const term = (extra?: MatchNarrowing): STerm =>
    bindTerm(termTaxonomyMatch(name, extra));
  return {
    ...term(),
    slug: (slug: string) => term({ slug }),
    id: (id: number) => term({ id }),
    whereMeta: (key: keyof StoredTermMetaOf<K>, value: unknown) =>
      term({ predicate: termMetaEquals(String(key), value) }),
    where: (
      predicate: (data: TermArchiveData<ResolvedTermFor<K>>) => boolean,
    ) =>
      term({
        // Safety: the surrounding matcher pins `nodeKind` and `type`, so the
        // resolver only calls this predicate with the term data it was written
        // against.
        predicate: predicate as unknown as (d: TemplateData) => boolean,
      }),
  };
}

/** Author archives. No registry to autocomplete against, so no name. */
export function authorTargets<S extends object>(
  bind: BindRule<S>,
): S & AuthorTargets<S> {
  const authorNode = (extra?: MatchNarrowing): S =>
    bind({ match: { nodeKind: "author", type: "author", ...extra } });
  return {
    ...authorNode(),
    slug: (slug: string) => authorNode({ slug }),
    id: (id: number) => authorNode({ id }),
  };
}

/** One date archive, at the granularity the arguments give. */
export function dateTargets<S>(bind: BindRule<S>): DateTargets<S> {
  return (year: number, month?: number, day?: number): S =>
    bind({
      match: {
        nodeKind: "date",
        type: "date",
        year,
        ...(month !== undefined ? { month } : {}),
        ...(day !== undefined ? { day } : {}),
      },
    });
}

/** One plugin-registered view (`registerView`). */
export function viewTargets<S>(name: string, bind: BindRule<S>): S {
  return bind({ match: { nodeKind: "view", type: name } });
}

/** One plugin-registered archive type (`registerArchiveType`). */
export function archiveTypeTargets<S>(name: string, bind: BindRule<S>): S {
  return bind({ match: { nodeKind: "archiveType", type: name } });
}
