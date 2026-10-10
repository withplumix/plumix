import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { AppContext } from "../context/app-context.js";
import type { SQL } from "../db/index.js";
import type { Entry, EntryStatus } from "../db/schema/entries.js";
import type { JsonObject } from "../json.js";
import type { WithResolvedMeta } from "../meta/contract/bags.js";
import { entryCapabilityByName } from "../access/contract/entry-capabilities.js";
import { entryTag } from "../cdn/contract/tags.js";
import { and, asc, desc, eq, inArray, isNull, not } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import { entrySearchCondition } from "../db/search-conditions.js";
import { resolveEntriesMeta, resolveEntryMeta } from "../meta/entry.js";
import { tokenizeSearchQuery } from "../search/contract/search-terms.js";
import { isAuthoredEntryType, loadAuthoredEntry } from "./authored.js";
import { EntryReadError } from "./errors.js";
import { loadEntryTerms } from "./terms.js";
import {
  canReadEntry,
  canReadUnpublished,
  readableEntryRows,
} from "./visibility.js";

const PUBLIC_STATUS: EntryStatus = "published";
const TRASH_STATUS: EntryStatus = "trash";

/** Request-memoized, so consumers gating on one entry's type share a query. */
export async function readEntryType(
  ctx: AppContext,
  id: number,
): Promise<string | null> {
  return ctx.memo(
    `core:entry-type:${String(id)}`,
    async () => {
      const [row] = await ctx.db
        .select({ type: entries.type })
        .from(entries)
        .where(eq(entries.id, id));
      return row?.type ?? null;
    },
    [entryTag(id)],
  );
}

/**
 * What {@link listEntries} filters, orders and pages by: what the `entry.list`
 * input schema parses to, defaults filled in.
 */
export interface ListEntriesInput {
  readonly type?: string | undefined;
  readonly status?: StatusInput;
  readonly authorId?: number | undefined;
  readonly parentId?: number | null | undefined;
  readonly search?: string | undefined;
  readonly termTaxonomies?:
    Readonly<Record<string, readonly string[]>> | undefined;
  readonly orderBy: "updated_at" | "published_at" | "title" | "sort_order";
  readonly order: "asc" | "desc";
  readonly limit: number;
  readonly offset: number;
}

/** The entry {@link getEntry} reads. */
export interface GetEntryInput {
  readonly id: number;
}

type EntryRead = WithResolvedMeta<Entry> & {
  readonly terms: Record<string, number[]>;
};

/**
 * Throws {@link EntryReadError} for reserved types and missing read
 * capability. A caller who can see nothing unpublished asking for drafts gets
 * an empty list, as WP does.
 */
export async function listEntries(
  ctx: AppContext,
  input: ListEntriesInput,
): Promise<readonly WithResolvedMeta<Entry>[]> {
  const rows = await listEntryRows(ctx, input);
  const bags = await resolveEntriesMeta(ctx, rows);
  return rows.map((row, i) => ({ ...row, meta: bags[i] ?? {} }));
}

/** For a caller resolving rows another way, as the REST API does. */
export async function listEntryRows(
  ctx: AppContext,
  input: ListEntriesInput,
): Promise<readonly Entry[]> {
  const type = input.type ?? "post";
  if (!isAuthoredEntryType(type)) throw EntryReadError.reservedType(type);
  const readable = readableEntryRows(ctx, type);
  if (readable === null) {
    throw EntryReadError.forbidden(
      entryCapabilityByName(ctx.plugins, type, "read"),
    );
  }

  const statusClause = resolveStatusClause(
    input.status,
    canReadUnpublished(ctx, type),
  );
  if (statusClause === "forbidden") return [];

  const conditions: SQL[] = [readable, statusClause];
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
      conditions.push(entrySearchCondition(term));
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
 * Every condition that would reveal an entry the caller can't see collapses to
 * `not_found`. Preview/autosave overlay lives in the oRPC adapter.
 */
export async function getEntry(
  ctx: AppContext,
  input: GetEntryInput,
): Promise<EntryRead> {
  const row = await findReadableEntry(ctx, input);
  return resolveEntryRead(ctx, row, row.meta);
}

/**
 * For a caller with something to do with the stored meta first, such as
 * settling it.
 */
export async function findReadableEntry(
  ctx: AppContext,
  input: GetEntryInput,
): Promise<Entry> {
  const row = await loadAuthoredEntry(ctx.db, input.id);
  if (!row) throw EntryReadError.notFound(input.id);
  if (!canReadEntry(ctx, row)) throw EntryReadError.notFound(input.id);
  return row;
}

/** Resolve a readable row into what {@link getEntry} hands back. */
export async function resolveEntryRead(
  ctx: AppContext,
  row: Entry,
  storedMeta: JsonObject | null,
): Promise<EntryRead> {
  const meta = await resolveEntryMeta(ctx, row, storedMeta);
  const entryTerms = await loadEntryTerms(ctx, row.id);
  return { ...row, meta, terms: entryTerms };
}

/**
 * Kept here, not in schemas.ts, so schemas.ts stays free of drizzle imports.
 */
const ORDER_COLUMNS: Record<ListEntriesInput["orderBy"], AnySQLiteColumn> = {
  updated_at: entries.updatedAt,
  published_at: entries.publishedAt,
  title: entries.title,
  sort_order: entries.sortOrder,
};

type StatusInput =
  EntryStatus | readonly (EntryStatus | undefined)[] | undefined;

/**
 * `undefined` excludes trash. "forbidden" yields an empty result rather than a
 * 403, as WP's admin silently filters.
 */
function resolveStatusClause(
  input: StatusInput,
  canSeeUnpublished: boolean,
): SQL | "forbidden" {
  const normalized = normalizeStatusInput(input);
  if (
    !canSeeUnpublished &&
    normalized?.some((status) => status !== PUBLIC_STATUS)
  ) {
    return "forbidden";
  }
  if (normalized === undefined) return not(eq(entries.status, TRASH_STATUS));
  const [only, ...rest] = normalized;
  if (only !== undefined && rest.length === 0) return eq(entries.status, only);
  return inArray(entries.status, normalized);
}

/** Collapse the valibot-widened input into a non-empty list or `undefined`. */
function normalizeStatusInput(
  input: StatusInput,
): readonly EntryStatus[] | undefined {
  if (input === undefined) return undefined;
  const list = Array.isArray(input)
    ? input.filter((s): s is EntryStatus => s !== undefined)
    : [input as EntryStatus];
  return list.length === 0 ? undefined : list;
}
