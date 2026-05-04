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
  async exists(ctx, id, scope) {
    const numericId = parseTermId(id);
    if (numericId === null) return false;
    const row = await ctx.db
      .select({ id: terms.id })
      .from(terms)
      .where(buildTermWhere(numericId, scope))
      .limit(1);
    return row.length > 0;
  },

  async list(ctx, options) {
    const conditions = scopeConditions(options.scope);
    const trimmedQuery = options.query?.trim();
    if (trimmedQuery) {
      const pattern = `%${trimmedQuery}%`;
      const queryMatch = or(
        like(terms.name, pattern),
        like(terms.slug, pattern),
      );
      if (queryMatch) conditions.push(queryMatch);
    }
    const rows = await ctx.db
      .select(TERM_ROW_COLUMNS)
      .from(terms)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(terms.name)
      .limit(clampLimit(options.limit));
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
