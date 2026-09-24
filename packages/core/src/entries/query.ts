import type { AppContext } from "../context/app.js";
import type { SQL, SQLWrapper } from "../db/index.js";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "../db/index.js";
import { metaJsonPath } from "../db/meta-path.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { dateRange } from "../route/date-range.js";
import { findAuthorBySlug, findTermAt } from "../route/path-chain.js";
import { EntryQueryError } from "./errors.js";

/**
 * One recorded narrowing. Intent, not SQL: a query is built where the caller
 * knows what it wants and compiled where there is a database to resolve a term
 * slug or an author against, so building one costs no queries.
 */
type EntryNarrowing =
  | { readonly kind: "types"; readonly names: readonly string[] }
  | {
      readonly kind: "term";
      readonly taxonomy: string;
      readonly path: readonly string[];
    }
  | { readonly kind: "author"; readonly slug: string }
  | {
      readonly kind: "dateRange";
      readonly year: number;
      readonly month: number | null;
      readonly day: number | null;
    }
  | { readonly kind: "under"; readonly parentId: number }
  | { readonly kind: "sql"; readonly condition: SQL }
  | { readonly kind: "none" };

/** The entry columns an archive may sort on. */
export type EntryOrderColumn = "publishedAt" | "title" | "sortOrder";

export type EntryOrderDirection = "asc" | "desc";

/**
 * The one order a query is read in. Recorded like a narrowing and just as
 * unreadable from outside, but unlike one it replaces rather than accumulates:
 * a second call to order a query is a caller saying what the order is, not
 * adding a secondary sort under the first.
 */
type EntryOrder =
  | {
      readonly kind: "column";
      readonly column: EntryOrderColumn;
      readonly direction: EntryOrderDirection;
    }
  | {
      readonly kind: "meta";
      /** The JSON path, resolved where the key was given so a bad one is refused there. */
      readonly path: string;
      readonly direction: EntryOrderDirection;
    };

const LATEST: EntryOrder = {
  kind: "column",
  column: "publishedAt",
  direction: "desc",
};

const OLDEST: EntryOrder = {
  kind: "column",
  column: "publishedAt",
  direction: "asc",
};

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
 * nothing to rebuild: a query is only ever what {@link entryQuery} minted and
 * the narrowings that were added to it.
 *
 * Compile it with {@link compileEntryQuery}.
 */
export interface EntryQuery {
  /** Entries of these types. Two calls intersect, they don't union. */
  ofTypes: (...names: readonly string[]) => EntryQuery;
  /**
   * Entries attached to the term at this slug path in this taxonomy — one
   * segment for a top-level term, `parent/child` for a nested one, and the
   * slug alone for any term of a taxonomy whose URLs are flat. It is the path
   * the term's page sits at, so a term page and a query naming it agree. A
   * path no term answers to leaves the query unresolvable.
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

interface QueryState {
  readonly narrowings: readonly EntryNarrowing[];
  readonly order: EntryOrder;
}

const STATE = new WeakMap<EntryQuery, QueryState>();

function queryOf(state: QueryState): EntryQuery {
  const narrowedBy = (narrowing: EntryNarrowing): EntryQuery =>
    queryOf({ ...state, narrowings: [...state.narrowings, narrowing] });
  const orderedBy = (order: EntryOrder): EntryQuery =>
    queryOf({ ...state, order });
  // Frozen so the methods cannot be swapped out either: a query that has been
  // handed across a boundary is finished being defined.
  const query: EntryQuery = Object.freeze({
    latest: () => orderedBy(LATEST),
    oldest: () => orderedBy(OLDEST),
    orderBy: (
      column: EntryOrderColumn,
      direction: EntryOrderDirection = "asc",
    ) => orderedBy({ kind: "column", column, direction }),
    orderByMeta: (key: string, direction: EntryOrderDirection = "asc") => {
      // Resolved where the key is given rather than where the SQL is built:
      // a key carrying a quote or a backslash names a value no entry can
      // hold, so an order on it is a mistake to report rather than a sort to
      // approximate. Pass a visitor's input to it and that report is a 500 —
      // check it against the keys the archive knows first.
      const path = metaJsonPath(key);
      if (path === null) throw EntryQueryError.metaKeyHasNoPath(key);
      return orderedBy({ kind: "meta", path, direction });
    },
    ofTypes: (...names: readonly string[]) =>
      narrowedBy({ kind: "types", names }),
    inTerm: (taxonomy: string, path: string | readonly string[]) =>
      narrowedBy({
        kind: "term",
        taxonomy,
        path: typeof path === "string" ? [path] : path,
      }),
    byAuthor: (slug: string) => narrowedBy({ kind: "author", slug }),
    inDateRange: (
      year: number,
      month: number | null = null,
      day: number | null = null,
    ) => narrowedBy({ kind: "dateRange", year, month, day }),
    under: (parentId: number) => narrowedBy({ kind: "under", parentId }),
    where: (condition: SQL) => narrowedBy({ kind: "sql", condition }),
    none: () => narrowedBy({ kind: "none" }),
  });
  STATE.set(query, state);
  return query;
}

/** An entry query constraining nothing yet, read newest first. */
export function entryQuery(): EntryQuery {
  return queryOf({ narrowings: [], order: LATEST });
}

// Capped for the reason the ancestor walk in `route/permalink.ts` is: nothing
// in the schema forbids a cycle in `parent_id`, and `plumix/db` hands direct
// writes to plugins, so a walk with no bound turns one malformed pair of rows
// into a request that never finishes. Real content trees stay far under this.
const MAX_SUBTREE_DEPTH = 50;

// The CTE sits inside `IN (…)` rather than being joined so the condition
// composes with whatever else the query narrows by.
function descendantsOf(parentId: number): SQL {
  return sql`${entries.id} IN (WITH RECURSIVE descendants(id, depth) AS (
    SELECT ${entries.id}, 0 FROM ${entries} WHERE ${entries.parentId} = ${parentId}
    UNION ALL
    SELECT ${entries.id}, descendants.depth + 1 FROM ${entries}
    JOIN descendants ON ${entries.parentId} = descendants.id
    WHERE descendants.depth < ${MAX_SUBTREE_DEPTH}
  ) SELECT id FROM descendants)`;
}

// Every arm returns, so a narrowing kind added without a translation for it is
// a compile error here rather than a narrowing the compiler lets fall through.
async function conditionsFor(
  ctx: AppContext,
  narrowing: EntryNarrowing,
): Promise<readonly SQL[] | null> {
  switch (narrowing.kind) {
    case "types":
      return [inArray(entries.type, [...narrowing.names])];
    case "term": {
      const term = await findTermAt(ctx, narrowing.taxonomy, narrowing.path);
      if (term === null) return null;
      const attached = ctx.db
        .select({ id: entryTerm.entryId })
        .from(entryTerm)
        .where(eq(entryTerm.termId, term.id));
      return [inArray(entries.id, attached)];
    }
    case "author": {
      const author = await findAuthorBySlug(ctx, narrowing.slug);
      if (author === null) return null;
      return [eq(entries.authorId, author.id)];
    }
    case "dateRange": {
      const range = dateRange(narrowing.year, narrowing.month, narrowing.day);
      if (range === null) return null;
      return [
        gte(entries.publishedAt, range.start),
        lt(entries.publishedAt, range.end),
      ];
    }
    case "under":
      return [descendantsOf(narrowing.parentId)];
    case "none":
      return [sql`1 = 0`];
    case "sql":
      return [narrowing.condition];
  }
}

// Each condition is parenthesized before it is joined, and the conjunction
// again after: drizzle's `and` wraps the whole conjunction but not its
// operands, so a top-level `OR` inside one condition binds looser than the
// `AND`s around it and admits rows every other narrowing excluded. Which is to
// say: without these parentheses `where` can widen a query, and a narrowing
// that can widen is the hole this whole type exists to close.
function allOf(conditions: readonly SQL[]): SQL {
  const combined = and(...conditions.map((condition) => sql`(${condition})`));
  return combined === undefined ? sql`(1 = 1)` : sql`(${combined})`;
}

function stateOf(query: EntryQuery): QueryState {
  const state = STATE.get(query);
  if (state === undefined) throw EntryQueryError.foreignQuery();
  return state;
}

const ORDER_TERMS: Record<EntryOrderColumn, SQL> = {
  publishedAt: sql`${entries.publishedAt}`,
  title: sql`${entries.title} collate nocase`,
  sortOrder: sql`${entries.sortOrder}`,
};

/**
 * The entry types this query can list — what every `ofTypes` on it agrees on,
 * since two of them intersect — or `null` where it names none and any type
 * could answer. Read by the CDN tagging, which has to know what publishing
 * could change this archive's page without running the query.
 */
export function entryQueryTypeNames(
  query: EntryQuery,
): readonly string[] | null {
  let names: readonly string[] | null = null;
  for (const narrowing of stateOf(query).narrowings) {
    if (narrowing.kind !== "types") continue;
    names =
      names === null
        ? narrowing.names
        : names.filter((name) => narrowing.names.includes(name));
  }
  return names;
}

/**
 * The `ORDER BY` terms a query is read in — the order it recorded, then the
 * entry id in the same direction. The id is never optional: two rows with the
 * same sort value in an order SQLite is free to pick between would swap
 * places between the count and the page query, and a row would show up twice
 * or not at all across a page boundary.
 */
export function entryQueryOrder(query: EntryQuery): readonly SQL[] {
  const { order } = stateOf(query);
  const sorted = (term: SQLWrapper): SQL =>
    order.direction === "asc" ? asc(term) : desc(term);
  const primary =
    order.kind === "column"
      ? ORDER_TERMS[order.column]
      : sql`json_extract(${entries.meta}, ${order.path})`;
  return [sorted(primary), sorted(entries.id)];
}

/**
 * The one condition a query narrows by, for the caller to `and` onto its own.
 * A query that narrows nothing compiles to a condition every row satisfies;
 * `null` is a query that names something no row could match — a term path
 * nothing answers to — which a route surface reads as a 404 rather than as an
 * empty result.
 *
 * It is one condition rather than a list because a list is a shape a caller
 * can drop part of.
 */
export async function compileEntryQuery(
  ctx: AppContext,
  query: EntryQuery,
): Promise<SQL | null> {
  const { narrowings } = stateOf(query);

  // The lookups a narrowing needs are independent of each other, so they go out
  // together rather than one round-trip at a time. An unresolvable narrowing
  // therefore costs the others their answers, which is the cheaper side of the
  // trade: it happens on the 404 path, where nothing is rendered anyway.
  const resolved = await Promise.all(
    narrowings.map((narrowing) => conditionsFor(ctx, narrowing)),
  );

  const conditions: SQL[] = [];
  for (const narrowed of resolved) {
    if (narrowed === null) return null;
    conditions.push(...narrowed);
  }
  return allOf(conditions);
}
