import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { AppContext } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { Entry, EntryStatus } from "../db/schema/entries.js";
import type {
  EntryGetInput,
  EntryListInput,
  EntryListOrderColumn,
} from "../rpc/procedures/entry/schemas.js";
import type { SearchTerm } from "../rpc/procedures/entry/search-terms.js";
import { and, asc, desc, eq, inArray, isNull, not, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import { isReservedType } from "../revisions/slug-codec.js";
import { entryCapability } from "../rpc/procedures/entry/lifecycle.js";
import { decodeMetaBag } from "../rpc/procedures/entry/meta.js";
import {
  escapeLikePattern,
  tokenizeSearchQuery,
} from "../rpc/procedures/entry/search-terms.js";
import { loadEntryTerms } from "../rpc/procedures/entry/terms.js";
import { EntryReadError } from "./errors.js";

const PUBLIC_STATUS: EntryStatus = "published";
const TRASH_STATUS: EntryStatus = "trash";

type EntryRead = Omit<Entry, "meta"> & {
  readonly meta: Record<string, unknown>;
  readonly terms: Record<string, number[]>;
};

/**
 * List entries of a type, clamped to what the caller may see. Capability checks
 * and status clamping live here so every transport (oRPC, MCP) reads through
 * the same policy. Throws {@link EntryReadError} for reserved types and missing
 * read capability; an explicit request for statuses the caller can't see
 * returns an empty list rather than erroring (matches WP's silent admin filter).
 */
export async function listEntries(
  ctx: AppContext,
  input: EntryListInput,
): Promise<readonly Entry[]> {
  const type = input.type ?? "post";
  if (isReservedType(type)) throw EntryReadError.reservedType(type);
  const readCapability = entryCapability(type, "read");
  if (!ctx.auth.can(readCapability)) {
    throw EntryReadError.forbidden(readCapability);
  }

  const canSeeAnyStatus = ctx.auth.can(entryCapability(type, "edit_any"));
  const statusClause = resolveStatusClause(input.status, canSeeAnyStatus);
  if (statusClause === "forbidden") return [];

  const conditions: SQL[] = [eq(entries.type, type), statusClause];
  if (input.authorId !== undefined) {
    conditions.push(eq(entries.authorId, input.authorId));
  }
  if (input.parentId === null) {
    conditions.push(isNull(entries.parentId));
  } else if (input.parentId !== undefined) {
    conditions.push(eq(entries.parentId, input.parentId));
  }
  if (input.search) {
    for (const term of tokenizeSearchQuery(input.search)) {
      conditions.push(searchTermCondition(term));
    }
  }
  if (input.termTaxonomies) {
    for (const [termTaxonomy, slugs] of Object.entries(input.termTaxonomies)) {
      if (slugs.length === 0) continue;
      // Correlated subquery: entries.id must appear in `entry_term` joined to
      // `terms` filtered by this taxonomy + listed slugs. One clause per
      // taxonomy; multiple clauses AND together — WP's default `tax_query`.
      const matching = ctx.db
        .select({ entryId: entryTerm.entryId })
        .from(entryTerm)
        .innerJoin(terms, eq(terms.id, entryTerm.termId))
        .where(
          and(
            eq(terms.taxonomy, termTaxonomy),
            inArray(terms.slug, [...slugs]),
          ),
        );
      conditions.push(inArray(entries.id, matching));
    }
  }

  const orderCol = ORDER_COLUMNS[input.orderBy];
  const primary = input.order === "asc" ? asc(orderCol) : desc(orderCol);
  // `entries.id` is always a desc tiebreaker — pagination must be stable
  // across ties on the user-selected order column.
  return ctx.db
    .select()
    .from(entries)
    .where(and(...conditions))
    .orderBy(primary, desc(entries.id))
    .limit(input.limit)
    .offset(input.offset);
}

/**
 * Read a single entry by id, hydrated with meta + terms. Every condition that
 * would reveal an entry the caller can't see — missing, reserved-type, no read
 * capability, or an unpublished status they can't view — collapses to
 * `not_found` so existence stays hidden. Preview/autosave overlay is an editor
 * concern and lives in the oRPC adapter, not here.
 */
export async function getEntry(
  ctx: AppContext,
  input: EntryGetInput,
): Promise<EntryRead> {
  const row = await ctx.db.query.entries.findFirst({
    where: eq(entries.id, input.id),
  });
  if (!row) throw EntryReadError.notFound(input.id);
  if (isReservedType(row.type)) throw EntryReadError.notFound(input.id);
  if (!ctx.auth.can(entryCapability(row.type, "read"))) {
    throw EntryReadError.notFound(input.id);
  }

  if (row.status !== PUBLIC_STATUS) {
    const canSeeAny = ctx.auth.can(entryCapability(row.type, "edit_any"));
    const ownsAndCanEdit =
      row.authorId === ctx.user?.id &&
      ctx.auth.can(entryCapability(row.type, "edit_own"));
    if (!canSeeAny && !ownsAndCanEdit) throw EntryReadError.notFound(input.id);
  }

  const meta = decodeMetaBag(ctx.plugins, row, row.meta);
  const entryTerms = await loadEntryTerms(ctx, row.id);
  return { ...row, meta, terms: entryTerms };
}

// Kept here, not in schemas.ts, so schemas.ts stays free of drizzle imports.
const ORDER_COLUMNS: Record<EntryListOrderColumn, AnySQLiteColumn> = {
  updated_at: entries.updatedAt,
  published_at: entries.publishedAt,
  title: entries.title,
  sort_order: entries.sortOrder,
};

type StatusInput =
  EntryStatus | readonly (EntryStatus | undefined)[] | undefined;

/**
 * Resolve the caller's `status` input into a WHERE clause, honoring the
 * capability check.
 *
 * - Can see any status + `undefined` → exclude trash (WP "All" tab).
 * - Can see any status + explicit list/string → match as given.
 * - Cannot see any status → pin to `published`; if they asked for anything
 *   else, return "forbidden" so the caller yields an empty result (not a 403 —
 *   WP's admin also silently filters).
 */
function resolveStatusClause(
  input: StatusInput,
  canSeeAnyStatus: boolean,
): SQL | "forbidden" {
  const normalized = normalizeStatusInput(input);

  if (!canSeeAnyStatus) {
    if (normalized === undefined) return eq(entries.status, PUBLIC_STATUS);
    if (normalized.length === 1 && normalized[0] === PUBLIC_STATUS) {
      return eq(entries.status, PUBLIC_STATUS);
    }
    return "forbidden";
  }

  if (normalized === undefined) return not(eq(entries.status, TRASH_STATUS));
  const [only, ...rest] = normalized;
  if (only !== undefined && rest.length === 0) return eq(entries.status, only);
  return inArray(entries.status, normalized);
}

// Collapse the valibot-widened input into a non-empty list or `undefined`.
function normalizeStatusInput(
  input: StatusInput,
): readonly EntryStatus[] | undefined {
  if (input === undefined) return undefined;
  const list = Array.isArray(input)
    ? input.filter((s): s is EntryStatus => s !== undefined)
    : [input as EntryStatus];
  return list.length === 0 ? undefined : list;
}

// One search term → `(title LIKE ? OR content LIKE ? OR excerpt LIKE ?)`
// against an explicit ESCAPE char so literal `%` / `_` in user input don't
// match-all. Excluded (`-term`) wraps the OR in `NOT (…)`. COALESCE handles
// nullable columns so null behaves as empty text across both clause polarities.
function searchTermCondition(term: SearchTerm): SQL {
  const pattern = `%${escapeLikePattern(term.value)}%`;
  const match = sql`(
    COALESCE(${entries.title}, '') LIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${entries.content}, '') LIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${entries.excerpt}, '') LIKE ${pattern} ESCAPE '\\'
  )`;
  return term.exclude ? not(match) : match;
}
