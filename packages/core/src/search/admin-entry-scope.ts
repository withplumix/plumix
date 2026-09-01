import type { AppContext } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { SearchGroup, SearchResultItem } from "./admin-search.js";
import { and, eq, not, or, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryCapability } from "../rpc/procedures/entry/lifecycle.js";

// Where the Content groups start. Terms take 100.., users later still, so
// there is room for one group per entry type between them.
const GROUP_PRIORITY_BASE = 10;

/** A palette group one entry type would fill, before it is filled. */
export interface AdminEntryGroup extends Omit<SearchGroup, "items"> {
  /** The entry type, for matching rows to the group they belong in. */
  readonly type: string;
}

/**
 * How much of an entry a surface intends to show, which decides which types
 * belong in the scope.
 *
 * `read` is every type the caller may read — the reach a list of titles has.
 * `edit` narrows to the types they may also edit, and is what a surface
 * showing more than a title has to ask for: `entry:<type>:read` bottoms out
 * at the subscriber tier, so on a site with open signup every reader holds it
 * for every registered type, including the ones that are never rendered
 * publicly.
 */
export interface AdminEntryScopeOptions {
  readonly reach?: "read" | "edit";
}

/** What of the entries table one admin caller is allowed to browse. */
export interface AdminEntryScope {
  /** The groups they may be shown, in the order the palette shows them. */
  readonly groups: readonly AdminEntryGroup[];
  /**
   * Which rows they may be shown, across every one of those types. Already
   * parenthesized, so a caller can `AND` it onto a predicate of its own
   * without the disjunction inside it swallowing that predicate.
   */
  readonly visible: SQL;
}

/**
 * The reach an admin browse surface gives this caller over `entries`.
 *
 * One seam rather than a clause per surface: the palette's own handler and a
 * search plugin's ranked replacement have to agree exactly on who may see
 * what and on what each group is called, and a second copy of these rules is
 * a second place for a draft to leak from.
 *
 * Mirrors `canReadEntry`'s visibility, minus trash — a browse surface hides
 * the bin, the way the entries list does by default. Published is always
 * visible; `edit_any` sees any non-trash; `edit_own` additionally sees its
 * own non-trash; everyone else sees published only.
 *
 * Group order does not follow `reach`: a group is numbered by where its type
 * sits among every type the caller may read, so two surfaces at different
 * reaches place the same group in the same spot.
 *
 * Null when nothing is in reach, so a caller with nothing to search stops
 * before touching the database.
 */
export function adminEntryScope(
  ctx: AppContext,
  { reach = "read" }: AdminEntryScopeOptions = {},
): AdminEntryScope | null {
  const userId = ctx.user?.id ?? null;
  const notTrash = not(eq(entries.status, "trash"));
  const canEditAny = (type: string) =>
    ctx.auth.can(entryCapability(type, "edit_any"));
  const canEditOwn = (type: string) =>
    userId !== null && ctx.auth.can(entryCapability(type, "edit_own"));

  const readable = [...ctx.plugins.entryTypes]
    .filter(([type]) => ctx.auth.can(entryCapability(type, "read")))
    .map(([type, spec], index) => ({
      type,
      key: `entry:${type}`,
      label: spec.labels?.plural ?? spec.label,
      priority: GROUP_PRIORITY_BASE + index,
    }));
  const groups = readable.filter(
    ({ type }) => reach === "read" || canEditAny(type) || canEditOwn(type),
  );
  const visible = or(
    ...groups.map(({ type }) => {
      const ofType = eq(entries.type, type);
      if (canEditAny(type)) return and(ofType, notTrash);
      if (userId !== null && canEditOwn(type)) {
        return and(
          ofType,
          notTrash,
          or(eq(entries.status, "published"), eq(entries.authorId, userId)),
        );
      }
      return and(ofType, eq(entries.status, "published"));
    }),
  );
  if (visible === undefined) return null;
  return { groups, visible: sql`(${visible})` };
}

/** A row an admin browse surface matched, whichever query found it. */
export interface MatchedEntry {
  readonly type: string;
  readonly id: number;
  readonly title: string;
}

/**
 * Bucket matched rows into the groups this caller may be shown, capped at
 * `limit` per group and dropping the groups nothing matched.
 *
 * Shared with the scope itself so a handler supplies a query and nothing
 * else: what a group is keyed and labelled by, how many rows one holds, and
 * how a row becomes an item are the palette's business rather than each
 * handler's. Rows are taken in the order the query returned them, so a
 * ranked query keeps its ranking and a dated one keeps its dates.
 */
export function entryGroups(
  scope: AdminEntryScope,
  rows: readonly MatchedEntry[],
  limit: number,
): readonly SearchGroup[] {
  const byType = new Map<string, SearchResultItem[]>();
  for (const row of rows) {
    const items = byType.get(row.type) ?? [];
    if (items.length >= limit) continue;
    items.push({ id: String(row.id), title: row.title });
    byType.set(row.type, items);
  }
  return scope.groups.flatMap(({ type, ...group }) => {
    const items = byType.get(type);
    return items === undefined ? [] : [{ ...group, items }];
  });
}
