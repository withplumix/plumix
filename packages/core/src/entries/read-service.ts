import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { AppContext } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { Entry, EntryStatus } from "../db/schema/entries.js";
import type { JsonObject } from "../json.js";
import type { WithResolvedMeta } from "../rpc/meta/core.js";
import type {
  EntryGetInput,
  EntryListInput,
  EntryListOrderColumn,
} from "../rpc/procedures/entry/schemas.js";
import { and, asc, desc, eq, inArray, isNull, not } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import {
  resolveEntriesMeta,
  resolveEntryMeta,
} from "../rpc/procedures/entry/meta.js";
import { tokenizeSearchQuery } from "../rpc/procedures/entry/search-terms.js";
import { loadEntryTerms } from "../rpc/procedures/entry/terms.js";
import { entrySearchCondition } from "../search/conditions.js";
import { isAuthoredEntryType, loadAuthoredEntry } from "./authored.js";
import { entryCapabilityByName } from "./capabilities.js";
import { EntryReadError } from "./errors.js";
import {
  canReadEntry,
  canReadUnpublished,
  readableEntryRows,
} from "./visibility.js";

const PUBLIC_STATUS: EntryStatus = "published";
const TRASH_STATUS: EntryStatus = "trash";

/**
 * The `type` of an entry by id, `null` when the entry doesn't exist.
 * Request-memoized (#1493): unrelated consumers gating on the resolved
 * entry's type in one render share a single query through this read.
 */
export async function readEntryType(
  ctx: AppContext,
  id: number,
): Promise<string | null> {
  return ctx.memo(`core:entry-type:${String(id)}`, async () => {
    const [row] = await ctx.db
      .select({ type: entries.type })
      .from(entries)
      .where(eq(entries.id, id));
    return row?.type ?? null;
  });
}

type EntryRead = WithResolvedMeta<Entry> & {
  readonly terms: Record<string, number[]>;
};

/**
 * List entries of a type, clamped to what the caller may see. Capability checks
 * and status clamping live here so every transport (oRPC, MCP) reads through
 * the same policy. Throws {@link EntryReadError} for reserved types and missing
 * read capability. Who may see which rows is `readableEntryRows`; the status
 * filter sits on top, so a contributor asking for drafts gets their own. A
 * caller who can see nothing unpublished asking for anything but `published`
 * gets an empty list rather than an error (matches WP's silent admin filter).
 */
export async function listEntries(
  ctx: AppContext,
  input: EntryListInput,
): Promise<readonly WithResolvedMeta<Entry>[]> {
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
  const rows = await ctx.db
    .select()
    .from(entries)
    .where(and(...conditions))
    .orderBy(primary, desc(entries.id))
    .limit(input.limit)
    .offset(input.offset);
  const bags = await resolveEntriesMeta(ctx, rows);
  return rows.map((row, i) => ({ ...row, meta: bags[i] ?? {} }));
}

/**
 * Read a single entry by id, resolved with meta + terms. Every condition that
 * would reveal an entry the caller can't see — missing, reserved-type, no read
 * capability, or an unpublished status they can't view — collapses to
 * `not_found` so existence stays hidden. Preview/autosave overlay is an editor
 * concern and lives in the oRPC adapter, not here.
 */
export async function getEntry(
  ctx: AppContext,
  input: EntryGetInput,
): Promise<EntryRead> {
  const row = await findReadableEntry(ctx, input);
  return resolveEntryRead(ctx, row, row.meta);
}

/**
 * The stored row behind {@link getEntry}, after the same visibility checks and
 * before anything is resolved — for a caller that has something to do with the
 * stored meta first, as the editor's read does when it settles it.
 */
export async function findReadableEntry(
  ctx: AppContext,
  input: EntryGetInput,
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
 * The caller's `status` input as a WHERE clause. Who may see which of those
 * rows is `readableEntryRows`' business, `AND`ed alongside.
 *
 * - `undefined` → exclude trash (WP "All" tab).
 * - Explicit list/string → match as given.
 * - Cannot see anything unpublished and asked for anything else → "forbidden"
 *   so the caller yields an empty result (not a 403 — WP's admin also silently
 *   filters).
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
