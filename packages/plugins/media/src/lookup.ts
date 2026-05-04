import type { LookupAdapter, LookupResult, SQL } from "@plumix/core";
import { and, desc, entries, eq, inArray, like, sql } from "@plumix/core";

import { parseMediaMeta } from "./meta.js";

const MEDIA_ENTRY_TYPE = "media";

const DEFAULT_LIST_LIMIT = 24;
const MAX_LIST_LIMIT = 100;

const MEDIA_ROW_COLUMNS = {
  id: entries.id,
  title: entries.title,
  meta: entries.meta,
} as const;

/**
 * Public scope shape for the `media` reference field. Carried on the
 * field's `referenceTarget.scope`; the media `LookupAdapter` consumes
 * it for write-time validation, picker filtering, and read-time
 * orphan resolution.
 *
 * `accept` is either a single MIME prefix string (`"image/"` matches
 * `image/png`, `image/jpeg`, …) or a readonly array of exact MIME
 * matches. Drop HTML's `image/*` wildcard syntax — the trailing slash
 * already conveys "category" and avoids the `image/*` vs `image/`
 * ambiguity.
 */
export interface MediaFieldScope {
  readonly accept?: string | readonly string[];
}

/**
 * Server-side adapter for the `media` reference field. Storage is the
 * cached-object shape (`{ id, mime, filename }`) — the meta pipeline
 * pulls `cached` from `LookupResult` and merges it into the stored
 * value on every write so reads render thumbnails without an extra
 * resolve round-trip.
 *
 * Queries:
 *  - `list({ ids })`: PK lookup via `inArray(entries.id, …)` + the
 *    `entries_type_status_published_idx` partition. SQLite picks the
 *    PK as the most selective; the type+status filter is post-applied
 *    to a small rowset.
 *  - `list({ query })`: leverages `entries_type_status_published_idx`
 *    for the `(type, status)` prefix; ordered by `desc(publishedAt)`
 *    matches the index's third column (no extra sort).
 *  - MIME `accept` filter: post-filter in JS against the meta JSON.
 *    The narrowed rowset (type+status or PK) keeps this tractable
 *    without a generated column.
 *
 * Drafts and trashed media are invisible to the picker — only
 * `status = "published"` rows surface. A draft media entry exists
 * between `media.createUploadUrl` (writes a draft row) and
 * `media.confirm` (flips to published) — referencing one would point
 * at an asset whose bytes haven't been verified.
 */
export const mediaLookupAdapter: LookupAdapter<MediaFieldScope> = {
  async list(ctx, options) {
    const conditions: SQL[] = [
      eq(entries.type, MEDIA_ENTRY_TYPE),
      eq(entries.status, "published"),
    ];
    const acceptCondition = buildAcceptCondition(options.scope?.accept);
    if (acceptCondition) conditions.push(acceptCondition);

    let limit: number;
    if (options.ids !== undefined) {
      const numericIds = options.ids
        .map((id) => parseMediaId(id))
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
      .select(MEDIA_ROW_COLUMNS)
      .from(entries)
      .where(and(...conditions))
      .orderBy(desc(entries.publishedAt), desc(entries.id))
      .limit(limit);

    const results: LookupResult[] = [];
    for (const row of rows) {
      const meta = parseMediaMeta(row.meta);
      if (!meta) continue;
      results.push(toLookupResult(row.id, row.title, meta.mime));
    }
    return results;
  },

  async resolve(ctx, id, scope) {
    const numericId = parseMediaId(id);
    if (numericId === null) return null;
    const conditions: SQL[] = [
      eq(entries.id, numericId),
      eq(entries.type, MEDIA_ENTRY_TYPE),
      eq(entries.status, "published"),
    ];
    const acceptCondition = buildAcceptCondition(scope?.accept);
    if (acceptCondition) conditions.push(acceptCondition);
    const [row] = await ctx.db
      .select(MEDIA_ROW_COLUMNS)
      .from(entries)
      .where(and(...conditions))
      .limit(1);
    if (!row) return null;
    const meta = parseMediaMeta(row.meta);
    if (!meta) return null;
    return toLookupResult(row.id, row.title, meta.mime);
  },
};

function parseMediaId(id: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(requested), MAX_LIST_LIMIT);
}

// Translate the `accept` scope into a SQL predicate against the
// extracted JSON `mime` field. Pushing the filter into SQL means the
// browse path's LIMIT clause counts only rows that pass the accept
// filter — post-filtering in JS would silently under-fill the picker
// grid for fields whose accept rejects a chunk of the recent uploads.
//
// `meta.mime` isn't indexed (no generated column), but the type+status
// filter has already narrowed the rowset before this predicate is
// applied, so the cost is bounded. Real MIME strings don't contain
// `%`/`_`, and plugin-supplied prefixes are trusted (set at field-
// build time, not user input), so no LIKE escaping needed.
function buildAcceptCondition(
  accept: string | readonly string[] | undefined,
): SQL | undefined {
  if (accept === undefined) return undefined;
  const mimeExpr = sql<string>`json_extract(${entries.meta}, '$.mime')`;
  if (typeof accept === "string") {
    if (accept === "") return undefined;
    return like(mimeExpr, `${accept}%`);
  }
  if (accept.length === 0) return undefined;
  return inArray(mimeExpr, accept as string[]);
}

function toLookupResult(id: number, title: string, mime: string): LookupResult {
  return {
    id: String(id),
    label: title,
    subtitle: mime,
    cached: { mime, filename: title },
  };
}
