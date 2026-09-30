import type { SQL } from "drizzle-orm";

/** The entry columns an archive may sort on. */
export type EntryOrderColumn = "publishedAt" | "title" | "sortOrder";

export type EntryOrderDirection = "asc" | "desc";

/**
 * A description of a set of entries, built up by narrowing. Every method
 * returns a new query with one more condition on it, so what a caller hands
 * out can be restricted by whoever receives it and never widened — the
 * property that makes a query safe to pass across an extension boundary.
 *
 * What a query has recorded is deliberately not on it. A readable member would
 * be a writable one after a single assertion, and `{ ...given, narrowings: [] }`
 * would be how a plugin returns an unrestricted query while still satisfying
 * this type. Held beside the query instead, there is nothing to overwrite and
 * nothing to rebuild: a query is only ever what `entryQuery` minted and
 * the narrowings that were added to it.
 *
 * Compile it with `compileEntryQuery`.
 */
export interface EntryQuery {
  /** Entries of these types. Two calls intersect, they don't union. */
  ofTypes: (...names: readonly string[]) => EntryQuery;
  /**
   * Entries attached to the term this slug, or the last segment of this slug
   * path, names in this taxonomy. The last segment addresses the term: a slug
   * is unique in its taxonomy, so the ancestors before it identify nothing,
   * and a term page and a query naming it agree whichever URL the page was
   * reached at. A slug no term answers to leaves the query unresolvable.
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
   * Entries anywhere beneath this parent — its children, their children, and
   * so on, the parent itself excluded. The walk stops 50 levels down, and on a
   * cycle in the parent chain it includes the parent it came back round to.
   */
  under: (parentId: number) => EntryQuery;
  /**
   * An arbitrary predicate, ANDed on. The last resort. It is parenthesized, so
   * a top-level `OR` stays inside it; a raw fragment (`sql.raw`) that closes
   * those parentheses is outside what any query can guard against.
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
   * Read in this column's order, the entry id breaking ties in the same
   * direction so a row never straddles a page boundary. A later order call
   * replaces this one rather than sorting under it. A feed ignores the order
   * and stays newest first, because that is what a subscriber's reader assumes.
   *
   * `title` sorts case-insensitively (`COLLATE NOCASE`), because alphabetical
   * is what a reader means by it — though that folds ASCII only, so an
   * accented title still files after `z`. Only `publishedAt` rides an index;
   * the other two sort the matching rows, as `orderByMeta` does.
   */
  orderBy: (
    column: EntryOrderColumn,
    direction?: EntryOrderDirection,
  ) => EntryQuery;
  /**
   * Read in the order of a meta value, entries missing the key first ascending
   * and last descending, as SQL sorts NULL. Values sort as SQLite stored them,
   * so a key holding numbers on some rows and strings on others puts every
   * number before every string — a rank kept as `"10"` sorts before `"9"`.
   *
   * Costs an unindexed sort over every row the query matches: `meta` is a JSON
   * column and no index reaches inside one, so the plan is a temp B-tree with
   * a `json_extract` per row on top of it. Over 5,000 published posts, reading
   * one page of 20 measured 2.2ms against 0.14ms for {@link EntryQuery.latest}
   * — fine for an archive narrowed to a modest set, not for the whole site.
   */
  orderByMeta: (key: string, direction?: EntryOrderDirection) => EntryQuery;
}
