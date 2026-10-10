import type { SQL } from "drizzle-orm";

/** The entry columns an archive may sort on. */
export type EntryOrderColumn = "publishedAt" | "title" | "sortOrder";

export type EntryOrderDirection = "asc" | "desc";

/**
 * Every method narrows, so a receiver can restrict a query and never widen it.
 * The recorded narrowings are deliberately unreadable, so no assertion can
 * overwrite them.
 */
export interface EntryQuery {
  /** Entries of these types. Two calls intersect, they don't union. */
  ofTypes: (...names: readonly string[]) => EntryQuery;
  /**
   * Only the last path segment addresses the term, since a slug is unique in
   * its taxonomy. An unknown slug leaves the query unresolvable.
   */
  inTerm: (taxonomy: string, path: string | readonly string[]) => EntryQuery;
  /**
   * Entries authored by the user with this slug. A slug nobody holds leaves
   * the query unresolvable.
   */
  byAuthor: (slug: string) => EntryQuery;
  /**
   * Entries published in the `/YYYY[/MM[/DD]]` period, `month` and `day`
   * 1-based. Components that do not form a real date (Feb 30, month 13) leave
   * the query unresolvable.
   */
  inDateRange: (
    year: number,
    month?: number | null,
    day?: number | null,
  ) => EntryQuery;
  /**
   * Excludes the parent itself. The walk stops 50 levels down; on a cycle it
   * includes the parent it came back round to.
   */
  under: (parentId: number) => EntryQuery;
  /**
   * Parenthesized, so a top-level `OR` stays inside; a `sql.raw` fragment
   * closing the parentheses is beyond any guard.
   */
  where: (condition: SQL) => EntryQuery;
  /**
   * No entries at all. Distinct from a query that cannot resolve: this one
   * answers, with nothing in it, where the other has no answer to give.
   */
  none: () => EntryQuery;
  /** Newest publish date first. What a query is read in when none is given. */
  latest: () => EntryQuery;
  /** Oldest publish date first. */
  oldest: () => EntryQuery;
  /**
   * A later order replaces this one; feeds ignore it and stay newest first.
   * `title` uses `COLLATE NOCASE` (ASCII only). Only `publishedAt` rides an
   * index.
   */
  orderBy: (
    column: EntryOrderColumn,
    direction?: EntryOrderDirection,
  ) => EntryQuery;
  /**
   * Missing keys sort as NULL, and mixed types put every number before every
   * string. An unindexed sort over every matching row: fine for a modest set.
   */
  orderByMeta: (key: string, direction?: EntryOrderDirection) => EntryQuery;
}
