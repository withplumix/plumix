import type { SQL } from "drizzle-orm";

import type { TermFieldScope } from "../../../plugin/fields/term.js";
import type { LookupAdapter, LookupResult } from "../../../plugin/lookup.js";
import { and, eq, inArray, like, or } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const TERM_ROW_COLUMNS = {
  id: terms.id,
  taxonomy: terms.taxonomy,
  name: terms.name,
  slug: terms.slug,
} as const;

export const termLookupAdapter: LookupAdapter<TermFieldScope> = {
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
        .map((id) => parseTermId(id))
        .filter((id): id is number => id !== null);
      if (numericIds.length === 0) return [];
      conditions.push(inArray(terms.id, numericIds));
      limit = numericIds.length;
    } else {
      const trimmedQuery = options.query?.trim();
      if (trimmedQuery) {
        const pattern = `%${trimmedQuery}%`;
        const queryMatch = or(
          like(terms.name, pattern),
          like(terms.slug, pattern),
        );
        if (queryMatch) conditions.push(queryMatch);
      }
      limit = clampLimit(options.limit);
    }
    const rows = await ctx.db
      .select(TERM_ROW_COLUMNS)
      .from(terms)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(terms.name)
      .limit(limit);
    return rows.map(toLookupResult);
  },

  async resolve(ctx, id, scope) {
    const numericId = parseTermId(id);
    if (numericId === null) return null;
    const [row] = await ctx.db
      .select(TERM_ROW_COLUMNS)
      .from(terms)
      .where(buildTermWhere(numericId, scope))
      .limit(1);
    return row ? toLookupResult(row) : null;
  },
};

function parseTermId(id: string): number | null {
  // terms.id is autoincrement; reject anything that isn't a positive integer.
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function buildTermWhere(numericId: number, scope: TermFieldScope | undefined) {
  return and(eq(terms.id, numericId), ...scopeConditions(scope));
}

function scopeConditions(scope: TermFieldScope | undefined): SQL[] {
  // See `entry/lookup.ts` for the same security note: enforcing the
  // taxonomy filter at runtime guards against wire-side callers that
  // omit it and would otherwise enumerate every term across every
  // taxonomy.
  if (!scope?.termTaxonomies || scope.termTaxonomies.length === 0) {
    throw new Error(
      "term adapter: scope.termTaxonomies is required and must be non-empty",
    );
  }
  return [inArray(terms.taxonomy, scope.termTaxonomies as string[])];
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(requested), MAX_LIST_LIMIT);
}

function toLookupResult(row: {
  readonly id: number;
  readonly taxonomy: string;
  readonly name: string;
  readonly slug: string;
}): LookupResult {
  return {
    id: String(row.id),
    label: row.name,
    subtitle: `${row.taxonomy} · ${row.slug}`,
  };
}
