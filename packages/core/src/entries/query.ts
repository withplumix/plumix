import type { AppContext } from "../context/app-context.js";
import type { SQL, SQLWrapper } from "../db/index.js";
import type {
  EntryOrderColumn,
  EntryOrderDirection,
  EntryQuery,
} from "./contract/query.js";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "../db/index.js";
import { metaJsonPath } from "../db/meta-path.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { dateRange } from "./date-range.js";
import { EntryQueryError } from "./errors.js";
import { findAuthorBySlug, findTermBySlug } from "./slug-lookups.js";

/**
 * Intent, not SQL: compiled where there is a database to resolve slugs
 * against, so building a query costs no queries.
 */
type EntryNarrowing =
  | { readonly kind: "types"; readonly names: readonly string[] }
  | {
      readonly kind: "term";
      readonly taxonomy: string;
      readonly slug: string;
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

/**
 * Replaces rather than accumulates: a second order call says what the order
 * is, not a secondary sort.
 */
type EntryOrder =
  | {
      readonly kind: "column";
      readonly column: EntryOrderColumn;
      readonly direction: EntryOrderDirection;
    }
  | {
      readonly kind: "meta";
      /** Resolved where the key was given, so a bad one is refused there. */
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
      // A key with a quote or backslash names a value no entry can hold, so
      // it throws. Check a visitor's input against known keys first, or it is
      // a 500.
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
        slug: typeof path === "string" ? path : (path.at(-1) ?? ""),
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

/**
 * Nothing forbids a `parent_id` cycle and plugins write directly, so an
 * unbounded walk could never finish.
 */
const MAX_SUBTREE_DEPTH = 50;

/**
 * The CTE sits inside `IN (…)` rather than being joined so the condition
 * composes with whatever else the query narrows by.
 */
function descendantsOf(parentId: number): SQL {
  return sql`${entries.id} IN (WITH RECURSIVE descendants(id, depth) AS (
    SELECT ${entries.id}, 0 FROM ${entries} WHERE ${entries.parentId} = ${parentId}
    UNION ALL
    SELECT ${entries.id}, descendants.depth + 1 FROM ${entries}
    JOIN descendants ON ${entries.parentId} = descendants.id
    WHERE descendants.depth < ${MAX_SUBTREE_DEPTH}
  ) SELECT id FROM descendants)`;
}

/**
 * Every arm returns, so a narrowing kind added without a translation for it is
 * a compile error here rather than a narrowing the compiler lets fall through.
 */
async function conditionsFor(
  ctx: AppContext,
  narrowing: EntryNarrowing,
): Promise<readonly SQL[] | null> {
  switch (narrowing.kind) {
    case "types":
      return [inArray(entries.type, [...narrowing.names])];
    case "term": {
      const term = await findTermBySlug(
        ctx,
        narrowing.taxonomy,
        narrowing.slug,
      );
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

/**
 * drizzle's `and` doesn't parenthesize its operands, so a top-level `OR` in
 * one condition would widen the query past every other narrowing.
 */
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
 * `null` when the query names no type and any type could answer. Two
 * `ofTypes` calls intersect.
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
 * Always ends with the entry id: rows tied on the sort value could otherwise
 * swap between count and page query and straddle a page boundary.
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
 * `null` when the query names something no row could match, such as an unknown
 * term slug; route surfaces read it as a 404, not an empty result.
 */
export async function compileEntryQuery(
  ctx: AppContext,
  query: EntryQuery,
): Promise<SQL | null> {
  const { narrowings } = stateOf(query);

  // Lookups go out together; an unresolvable narrowing wasting the others is
  // cheap, since it happens on the 404 path.
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
