import type { SQL } from "drizzle-orm";

import type { EntryFieldScope } from "../../../plugin/fields/entry.js";
import type { LookupAdapter, LookupResult } from "../../../plugin/lookup.js";
import { and, eq, inArray, like, ne } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const ENTRY_ROW_COLUMNS = {
  id: entries.id,
  type: entries.type,
  title: entries.title,
  status: entries.status,
} as const;

export const entryLookupAdapter: LookupAdapter<EntryFieldScope> = {
  async list(ctx, options) {
    const conditions = scopeConditions(options.scope);
    let limit: number;
    if (options.ids !== undefined) {
      // Resolve-by-id batch path: ignore `query`, return only the
      // requested ids (still subject to scope). Invalid ids are
      // silently dropped — they read as orphans on the caller's side.
      // Limit tracks `numericIds.length` (not `MAX_LIST_LIMIT`) since
      // the meta pipeline aggregates ids across same-`(kind,scope)`
      // fields and may legitimately request >100 in one call.
      const numericIds = options.ids
        .map((id) => parseEntryId(id))
        .filter((id): id is number => id !== null);
      if (numericIds.length === 0) return [];
      conditions.push(inArray(entries.id, numericIds));
      limit = numericIds.length;
    } else {
      const trimmedQuery = options.query?.trim();
      if (trimmedQuery) {
        conditions.push(like(entries.title, `%${trimmedQuery}%`));
      }
      limit = clampLimit(options.limit);
    }
    const rows = await ctx.db
      .select(ENTRY_ROW_COLUMNS)
      .from(entries)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(entries.title)
      .limit(limit);
    return rows.map(toLookupResult);
  },

  async resolve(ctx, id, scope) {
    const numericId = parseEntryId(id);
    if (numericId === null) return null;
    const [row] = await ctx.db
      .select(ENTRY_ROW_COLUMNS)
      .from(entries)
      .where(buildEntryWhere(numericId, scope))
      .limit(1);
    return row ? toLookupResult(row) : null;
  },
};

function parseEntryId(id: string): number | null {
  // entries.id is autoincrement; reject anything that isn't a positive integer.
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function buildEntryWhere(
  numericId: number,
  scope: EntryFieldScope | undefined,
) {
  return and(eq(entries.id, numericId), ...scopeConditions(scope));
}

function scopeConditions(scope: EntryFieldScope | undefined): SQL[] {
  // Required at runtime, not just at the builder's TS level: a wire-side
  // caller (lookup RPC, plugin-registered legacy field) could otherwise
  // omit `entryTypes` and silently disable the type filter — which would
  // turn the picker into a "list every entry across every type" channel
  // bypassing per-type read scoping.
  if (!scope?.entryTypes || scope.entryTypes.length === 0) {
    throw new Error(
      "entry adapter: scope.entryTypes is required and must be non-empty",
    );
  }
  const conditions: SQL[] = [
    inArray(entries.type, scope.entryTypes as string[]),
  ];
  if (!scope.includeTrashed) {
    conditions.push(ne(entries.status, "trash"));
  }
  return conditions;
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(requested), MAX_LIST_LIMIT);
}

function toLookupResult(row: {
  readonly id: number;
  readonly type: string;
  readonly title: string;
  readonly status: string;
}): LookupResult {
  const trimmedTitle = row.title.trim();
  return {
    id: String(row.id),
    label: trimmedTitle !== "" ? trimmedTitle : `Untitled ${row.type}`,
    subtitle: `${row.type} · ${row.status}`,
  };
}
