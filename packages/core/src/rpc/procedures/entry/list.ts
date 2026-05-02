import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { SQL } from "../../../db/index.js";
import type { Entry, EntryStatus } from "../../../db/schema/entries.js";
import type { EntryListOrderColumn } from "./schemas.js";
import type { SearchTerm } from "./search-terms.js";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  not,
  sql,
} from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { entryTerm } from "../../../db/schema/entry_term.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryCapability } from "./lifecycle.js";
import { entryListInputSchema } from "./schemas.js";
import { escapeLikePattern, tokenizeSearchQuery } from "./search-terms.js";

const PUBLIC_STATUS: EntryStatus = "published";

export const list = base
  .use(authenticated)
  .input(entryListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.list:input",
      input,
    );

    const type = filtered.type ?? "post";
    const readCapability = entryCapability(type, "read");
    if (!context.auth.can(readCapability)) {
      throw errors.FORBIDDEN({ data: { capability: readCapability } });
    }

    const canSeeAnyStatus = context.auth.can(entryCapability(type, "edit_any"));
    const statusClause = resolveStatusClause(filtered.status, canSeeAnyStatus);
    if (statusClause === "forbidden") {
      return context.hooks.applyFilter(
        "rpc:entry.list:output",
        [] as readonly Entry[],
      );
    }

    const conditions: SQL[] = [eq(entries.type, type)];
    conditions.push(statusClause);
    if (filtered.authorId !== undefined) {
      conditions.push(eq(entries.authorId, filtered.authorId));
    }
    if (filtered.parentId === null) {
      conditions.push(isNull(entries.parentId));
    } else if (filtered.parentId !== undefined) {
      conditions.push(eq(entries.parentId, filtered.parentId));
    }
    if (filtered.search) {
      for (const term of tokenizeSearchQuery(filtered.search)) {
        conditions.push(searchTermCondition(term));
      }
    }
    if (filtered.termTaxonomies) {
      for (const [termTaxonomy, slugs] of Object.entries(
        filtered.termTaxonomies,
      )) {
        if (slugs.length === 0) continue;
        // Correlated subquery: entries.id must appear in `entry_term` joined
        // to `terms` filtered by this termTaxonomy + listed slugs. One clause
        // per termTaxonomy; multiple clauses AND together — matching WP's
        // default `tax_query` relation.
        const matching = context.db
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

    const orderCol = ORDER_COLUMNS[filtered.orderBy];
    const primary = filtered.order === "asc" ? asc(orderCol) : desc(orderCol);
    // `entries.id` is always a desc tiebreaker — pagination must be stable
    // across ties on the user-selected order column.
    const rows = await context.db
      .select()
      .from(entries)
      .where(and(...conditions))
      .orderBy(primary, desc(entries.id))
      .limit(filtered.limit)
      .offset(filtered.offset);

    return context.hooks.applyFilter("rpc:entry.list:output", rows);
  });

// Whitelist map from wire-level column names to drizzle column refs.
// Keeping it here (not in schemas.ts) lets schemas.ts stay runtime-free of
// drizzle imports.
const ORDER_COLUMNS: Record<EntryListOrderColumn, AnySQLiteColumn> = {
  updated_at: entries.updatedAt,
  published_at: entries.publishedAt,
  title: entries.title,
  menu_order: entries.menuOrder,
};

const TRASH_STATUS: EntryStatus = "trash";

/**
 * Resolve the caller's `status` input into a WHERE clause, honoring the
 * capability check.
 *
 * - User can see any status + `undefined` → exclude trash (WP "All" tab).
 * - User can see any status + explicit list/string → match as given.
 * - User cannot see any status → pin to `published`; if they asked for
 *   anything else, short-circuit with "forbidden" so the caller returns
 *   an empty result (not a 403 — WP's admin also silently filters).
 *
 * Input type is what valibot's `v.union([picklist, v.array(picklist)])`
 * produces — the array inner type widens to `EntryStatus | undefined`
 * through valibot's pipe, so we filter at the boundary.
 */
type StatusInput =
  | EntryStatus
  | readonly (EntryStatus | undefined)[]
  | undefined;

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
// `v.minLength(1)` on the array schema blocks empty-array input at the
// boundary, but defend here too so the resolver's contract is explicit.
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
// match-all. Excluded (`-term`) wraps the OR in `NOT (…)`.
//
// `content` and `excerpt` are nullable; `LIKE` on NULL yields NULL, which
// is falsy for inclusion matches but becomes `NOT NULL` → still NULL → a
// false-negative for exclusion. COALESCE to empty string so null columns
// behave as empty text across both positive and negative clauses.
function searchTermCondition(term: SearchTerm): SQL {
  const pattern = `%${escapeLikePattern(term.value)}%`;
  // Build the column OR via the raw `sql` tag — `or(...)` returns
  // `SQL | undefined`, which fights both lint rules on non-null assertion
  // style. The sql-tag form has the same parameterization guarantees.
  const match = sql`(
    COALESCE(${entries.title}, '') LIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${entries.content}, '') LIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${entries.excerpt}, '') LIKE ${pattern} ESCAPE '\\'
  )`;
  return term.exclude ? not(match) : match;
}
