/**
 * The selection vocabulary shared by every rule kind a theme declares against
 * the node hierarchy — the mirror of `rule-resolver.ts`, which reads what these
 * mint. A rule kind supplies only how a selected `TierMatchRule` becomes its
 * own rule (a `BindRule`); which nodes a selector can target, the narrowings it
 * accepts and the matchers those produce are written once, here. Core's
 * `templates` and the OG plugin's `ogCards` both sit on top of it.
 *
 * Each targeted builder is split in two: an interface parameterised by the rule
 * kind's selector types, which a consumer composes into its own public builder,
 * and a constructor that fills it in. The pairing is what lets a rule kind keep
 * its own terminal — `.template(...)`, `.define(...)` — without restating the
 * chain that leads to it.
 *
 * Nothing here knows what a rule carries or who reads it. A narrowing that is
 * one half of a contract with another surface — `named`, which the editor's
 * template picker writes and `collectNamedTemplates` reads back — belongs to
 * the rule kind that holds up the other half, not to this layer. The `*Match`
 * constructors are exported for exactly that: a rule kind building a narrowing
 * of its own still mints the node prefix from one place.
 */

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
import type { EntryData, TaxonomyData } from "./resolved-entry.js";

/**
 * How a rule kind turns a selected match into one of its rules. The selector it
 * returns is typed to the data the match confines the rule to, which is what
 * types the payload the caller then binds.
 *
 * It has to return a fresh object literal carrying nothing but its own
 * terminal: the constructors below spread it to hang the narrowings off, so an
 * inherited method would be dropped and an own key named for a narrowing would
 * be overwritten by it.
 */
export type BindRule<S> = (where: TierMatchRule) => S;

/** The match an entry-type selector narrows from. */
export function entryTypeMatch(
  name: string,
  extra?: Partial<TargetMatcher>,
): TierMatchRule {
  return { match: { nodeKind: "content", type: name, ...extra } };
}

/** The match a taxonomy selector narrows from. */
export function termTaxonomyMatch(
  name: string,
  extra?: Partial<TargetMatcher>,
): TierMatchRule {
  return { match: { nodeKind: "term", type: name, ...extra } };
}

/** A predicate matching when a content entry's meta value equals `value`. */
export function metaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "entry" in data && data.entry.meta[key] === value;
}

/** A predicate matching when a resolved term's meta value equals `value`. */
export function termMetaEquals(
  key: string,
  value: unknown,
): (data: TemplateData) => boolean {
  return (data) => "term" in data && data.term.meta[key] === value;
}

/** Narrowings an entry-type selector accepts, plus the type's archive. */
export interface EntryTypeTargets<K extends EntryTypeName, SEntry, SArchive> {
  /** Narrow to one entry by slug. */
  slug(slug: string): SEntry;
  /** Narrow to one entry by numeric id. */
  id(id: number): SEntry;
  /**
   * Narrow by an entry-meta value, typed against the type's folded stored meta
   * shape (what actually sits in the meta JSON — decode-time defaults and
   * resolution don't apply here).
   */
  whereMeta<M extends keyof StoredMetaOf<K>>(
    key: M,
    value: StoredMetaOf<K>[M],
  ): SEntry;
  /** Narrow by an arbitrary predicate over the resolved data. */
  where(predicate: (data: EntryData<ResolvedEntryFor<K>>) => boolean): SEntry;
  /** The content-type archive listing. */
  readonly archive: SArchive;
}

/** Narrowings a taxonomy selector accepts. */
export interface TermTaxonomyTargets<K extends TermTaxonomyName, STerm> {
  /** Narrow to one term by slug. */
  slug(slug: string): STerm;
  /** Narrow to one term by numeric id. */
  id(id: number): STerm;
  /** Narrow by a term-meta value, typed against the taxonomy's folded stored meta shape. */
  whereMeta<M extends keyof StoredTermMetaOf<K>>(
    key: M,
    value: StoredTermMetaOf<K>[M],
  ): STerm;
  /** Narrow by an arbitrary predicate over the resolved taxonomy data. */
  where(predicate: (data: TaxonomyData<ResolvedTermFor<K>>) => boolean): STerm;
}

/** Narrowings an author selector accepts. */
export interface AuthorTargets<S> {
  /** Narrow to one author by slug. */
  slug(slug: string): S;
  /** Narrow to one author by numeric id. */
  id(id: number): S;
}

/**
 * A date selector. The three signatures rather than optional parameters are
 * what reject `(2026, undefined, 5)` — a day is meaningless without the month
 * above it, and the matcher an unset component mints has to stay unset.
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
  const content = (extra?: Partial<TargetMatcher>): SEntry =>
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
      match: { nodeKind: "content-type-archive", type: name },
    }),
  };
}

/** Terms of one registered taxonomy. */
export function termTaxonomyTargets<
  K extends TermTaxonomyName,
  STerm extends object,
>(name: K, bindTerm: BindRule<STerm>): STerm & TermTaxonomyTargets<K, STerm> {
  const term = (extra?: Partial<TargetMatcher>): STerm =>
    bindTerm(termTaxonomyMatch(name, extra));
  return {
    ...term(),
    slug: (slug: string) => term({ slug }),
    id: (id: number) => term({ id }),
    whereMeta: (key: keyof StoredTermMetaOf<K>, value: unknown) =>
      term({ predicate: termMetaEquals(String(key), value) }),
    where: (predicate: (data: TaxonomyData<ResolvedTermFor<K>>) => boolean) =>
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
  const authorNode = (extra?: Partial<TargetMatcher>): S =>
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

/** One plugin-registered archive type (`registerArchiveType`). */
export function archiveTypeTargets<S>(name: string, bind: BindRule<S>): S {
  return bind({ match: { nodeKind: "custom", type: name } });
}
