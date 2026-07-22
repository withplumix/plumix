import type {
  HydratedReference,
  LookupAdapter,
  LookupResult,
  SQL,
} from "plumix/plugin";
import { and, desc, entries, eq, inArray, like, sql } from "plumix/plugin";

import { parseMediaMeta } from "./meta.js";
import { resolveMediaUrl, thumbnailFor } from "./read-service.js";

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
 * Hydrated shape of a `media` reference — the read pipeline resolves
 * stored ids into this at read time, so themes can render a media meta
 * field (URL included) without a manual fetch. `id` stays the stored
 * string id so a hydrated value posted back through a meta write
 * self-heals to the plain id.
 */
export interface MediaReference extends HydratedReference {
  readonly title: string;
  readonly mime: string;
  readonly size: number;
  readonly alt: string | null;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly width: number | null;
  readonly height: number | null;
}

declare module "plumix/plugin" {
  interface ReferenceHydrationShapes {
    readonly media: MediaReference;
  }
}

/**
 * Server-side adapter for the `media` reference field. Storage is the
 * plain media id; `hydrate` resolves ids into `MediaReference` (URL
 * included) at read time through the shared meta pipeline.
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
// `satisfies` keeps `hydrate`'s concrete `MediaReference` return type
// visible instead of widening to the contract's `HydratedReference`.
export const mediaLookupAdapter = {
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

  async resolve(ctx, id, scope?) {
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

  async hydrate(ctx, options) {
    const numericIds = options.ids
      .map((id) => parseMediaId(id))
      .filter((id): id is number => id !== null);
    if (numericIds.length === 0) return [];
    const conditions: SQL[] = [
      eq(entries.type, MEDIA_ENTRY_TYPE),
      eq(entries.status, "published"),
      inArray(entries.id, numericIds),
    ];
    const acceptCondition = buildAcceptCondition(options.scope?.accept);
    if (acceptCondition) conditions.push(acceptCondition);
    const rows = await ctx.db
      .select(MEDIA_ROW_COLUMNS)
      .from(entries)
      .where(and(...conditions))
      .limit(numericIds.length);
    const parsed = rows.flatMap((row) => {
      const meta = parseMediaMeta(row.meta);
      return meta ? [{ row, meta }] : [];
    });
    // `storage.url()` can be a signing round-trip — resolve the batch
    // concurrently. Same URL resolution as `buildMediaItem`
    // (read-service) so a hydrated reference and `media.get` agree.
    return Promise.all(
      parsed.map(async ({ row, meta }): Promise<MediaReference> => {
        const url = ctx.storage
          ? await resolveMediaUrl(
              ctx.storage,
              meta.storageKey,
              row.id,
              ctx.basePath,
            )
          : meta.storageKey;
        return {
          id: String(row.id),
          title: row.title,
          mime: meta.mime,
          size: meta.size,
          alt: meta.alt,
          url,
          thumbnailUrl: thumbnailFor(ctx, url, meta.mime),
          width: meta.width,
          height: meta.height,
        };
      }),
    );
  },
} satisfies LookupAdapter<MediaFieldScope>;

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
  // Mirror the entry adapter's `null` contract for empty/whitespace
  // titles so admin pickers render a localized "Untitled" descriptor
  // rather than an empty `<p>`.
  const trimmedTitle = title.trim();
  const label = trimmedTitle !== "" ? trimmedTitle : null;
  return {
    id: String(id),
    label,
    targetType: MEDIA_ENTRY_TYPE,
    subtitle: mime,
  };
}
