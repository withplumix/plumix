import type { AppContext } from "../context/app-context.js";
import type { SQL } from "../db/index.js";
import type { SearchGroup, SearchResultItem } from "./admin-search.js";
import { namespacedEntryCapability } from "../access/contract/entry-capabilities.js";
import { and, eq, not, or, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import {
  canReadUnpublished,
  readableEntryRows,
} from "../entries/visibility.js";

// Where the Content groups start. Terms take 100.., users later still, so
// there is room for one group per entry type between them.
const GROUP_PRIORITY_BASE = 10;

/** A palette group one entry type would fill, before it is filled. */
export interface AdminEntryGroup extends Omit<SearchGroup, "items"> {
  /** The entry type, for matching rows to the group they belong in. */
  readonly type: string;
}

/**
 * A surface showing more than a title asks for `edit`: `entry:<type>:read`
 * reaches subscribers, so with open signup every reader holds it.
 */
export interface AdminEntryScopeOptions {
  readonly reach?: "read" | "edit";
}

/** What of the entries table one admin caller is allowed to browse. */
export interface AdminEntryScope {
  /** The groups they may be shown, in the order the palette shows them. */
  readonly groups: readonly AdminEntryGroup[];
  /**
   * Parenthesized, so the disjunction inside can't swallow a caller's own
   * predicate.
   */
  readonly visible: SQL;
}

/**
 * Shared so the palette and a search plugin agree exactly on who sees what.
 * Hides trash. Group order ignores `reach`. Null when nothing is in reach.
 */
export function adminEntryScope(
  ctx: Pick<AppContext, "user" | "auth" | "plugins">,
  { reach = "read" }: AdminEntryScopeOptions = {},
): AdminEntryScope | null {
  const notTrash = not(eq(entries.status, "trash"));

  const readable = [...ctx.plugins.entryTypes]
    .filter(([, spec]) => ctx.auth.can(namespacedEntryCapability(spec, "read")))
    .map(([type, spec], index) => ({
      type,
      key: `entry:${type}`,
      label: spec.labels?.plural ?? spec.label,
      priority: GROUP_PRIORITY_BASE + index,
    }));
  const groups = readable.filter(
    ({ type }) => reach === "read" || canReadUnpublished(ctx, type),
  );
  const visible = or(
    ...groups.flatMap(({ type }) => {
      const rows = readableEntryRows(ctx, type);
      return rows === null ? [] : [and(rows, notTrash)];
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
 * Keeps the rows in query order, so a ranked query keeps its ranking. Groups
 * nothing matched are dropped.
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
