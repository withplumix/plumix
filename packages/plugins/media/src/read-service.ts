import type { AppContext, SQL } from "plumix/plugin";
import {
  and,
  desc,
  entries,
  eq,
  escapeLikePattern,
  inArray,
  like,
  sql,
  withBasePath,
} from "plumix/plugin";
import * as v from "valibot";

import { parseMediaMeta } from "./meta.js";

export const MEDIA_ENTRY_TYPE = "media";
const MEDIA_READ_CAPABILITY = "entry:media:read";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

// 320px-wide auto-format thumbnail — enough for the 160px admin card at 2× DPI.
const THUMBNAIL_OPTS = { width: 320, format: "auto", fit: "cover" } as const;

export const mediaListInputSchema = v.object({
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_PAGE_SIZE)),
    DEFAULT_PAGE_SIZE,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  // MIME filter: string form (`"image/"`) does a `LIKE 'image/%'` prefix match;
  // array form matches the listed MIMEs exactly. Pushed into SQL so `limit`
  // counts only matching rows.
  accept: v.optional(
    v.union([
      v.pipe(v.string(), v.maxLength(64)),
      v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(32)),
    ]),
  ),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
});

type MediaListInput = v.InferOutput<typeof mediaListInputSchema>;

interface MediaItem {
  readonly id: number;
  readonly title: string;
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
  readonly alt: string | null;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly uploadedAt: string;
  readonly uploadedById: number;
  readonly width: number | null;
  readonly height: number | null;
}

interface MediaListResult {
  readonly items: readonly MediaItem[];
  readonly hasMore: boolean;
}

/**
 * Domain error the media read path throws. Each transport maps it to its own
 * shape (oRPC typed error / MCP envelope), keeping the service transport-neutral.
 */
export class MediaReadError extends Error {
  static {
    MediaReadError.prototype.name = "MediaReadError";
  }

  readonly data:
    | { readonly code: "forbidden"; readonly capability: string }
    | { readonly code: "not_found"; readonly id: number };

  private constructor(data: MediaReadError["data"], message: string) {
    super(message);
    this.data = data;
  }

  static forbidden(capability: string): MediaReadError {
    return new MediaReadError(
      { code: "forbidden", capability },
      `missing capability: ${capability}`,
    );
  }

  static notFound(id: number): MediaReadError {
    return new MediaReadError(
      { code: "not_found", id },
      `media ${id} not found`,
    );
  }
}

/**
 * List published media the caller may read, with MIME / filename filters and
 * offset pagination. Fetches one extra row to report `hasMore` without a
 * second COUNT query. Throws {@link MediaReadError}.
 */
export async function listMedia(
  ctx: AppContext,
  input: MediaListInput,
): Promise<MediaListResult> {
  if (!ctx.auth.can(MEDIA_READ_CAPABILITY)) {
    throw MediaReadError.forbidden(MEDIA_READ_CAPABILITY);
  }

  const conditions: SQL[] = [
    eq(entries.type, MEDIA_ENTRY_TYPE),
    eq(entries.status, "published"),
  ];
  const acceptCondition = buildAcceptCondition(input.accept);
  if (acceptCondition) conditions.push(acceptCondition);
  if (input.search) {
    const pattern = `%${escapeLikePattern(input.search)}%`;
    conditions.push(sql`(
      ${entries.title} LIKE ${pattern} ESCAPE '\\'
      OR COALESCE(json_extract(${entries.meta}, '$.alt'), '') LIKE ${pattern} ESCAPE '\\'
    )`);
  }

  const rows = await ctx.db
    .select()
    .from(entries)
    .where(and(...conditions))
    .orderBy(desc(entries.updatedAt), desc(entries.id))
    .limit(input.limit + 1)
    .offset(input.offset);
  const hasMore = rows.length > input.limit;
  const visibleRows = hasMore ? rows.slice(0, input.limit) : rows;

  const items: MediaItem[] = [];
  for (const row of visibleRows) {
    const meta = parseMediaMeta(row.meta);
    if (!meta) continue;
    items.push(await buildMediaItem(ctx, row, meta));
  }
  return { items, hasMore };
}

/**
 * Read a single published media item by id. A missing row, a non-media row, a
 * draft, or corrupt meta all collapse to `not_found` so existence stays hidden.
 */
export async function getMedia(
  ctx: AppContext,
  input: { readonly id: number },
): Promise<MediaItem> {
  if (!ctx.auth.can(MEDIA_READ_CAPABILITY)) {
    throw MediaReadError.forbidden(MEDIA_READ_CAPABILITY);
  }

  const row = await ctx.db.query.entries.findFirst({
    where: eq(entries.id, input.id),
  });
  const meta = row ? parseMediaMeta(row.meta) : null;
  if (row?.type !== MEDIA_ENTRY_TYPE || row.status !== "published" || !meta) {
    throw MediaReadError.notFound(input.id);
  }
  return buildMediaItem(ctx, row, meta);
}

async function buildMediaItem(
  ctx: AppContext,
  row: typeof entries.$inferSelect,
  meta: NonNullable<ReturnType<typeof parseMediaMeta>>,
): Promise<MediaItem> {
  const url = ctx.storage
    ? await resolveMediaUrl(ctx.storage, meta.storageKey, row.id, ctx.basePath)
    : meta.storageKey;
  // `publishedAt` is the "uploaded on" source of truth; fall back to createdAt.
  const uploadedAt = (row.publishedAt ?? row.createdAt).toISOString();
  return {
    id: row.id,
    title: row.title,
    mime: meta.mime,
    size: meta.size,
    storageKey: meta.storageKey,
    alt: meta.alt,
    url,
    thumbnailUrl: thumbnailFor(ctx, url, meta.mime),
    uploadedAt,
    uploadedById: row.authorId,
    width: meta.width,
    height: meta.height,
  };
}

export function thumbnailFor(
  ctx: AppContext,
  url: string,
  mime: string,
): string {
  // imageDelivery transforms need an absolute, publicly-reachable source — the
  // transform CDN fetches it itself. The worker-proxied serve fallback is
  // relative, so skip transforms there.
  if (!mime.startsWith("image/") || !ctx.imageDelivery) return url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return url;
  return ctx.imageDelivery.url(url, THUMBNAIL_OPTS);
}

/**
 * Resolve a publicly-fetchable URL for a media row. Prefers the storage
 * adapter's native URL; falls back to the worker-proxied serve route keyed on
 * the entry id (not the storageKey — the serve route enforces `published`).
 */
export async function resolveMediaUrl(
  storage: NonNullable<AppContext["storage"]>,
  storageKey: string,
  entryId: number,
  basePath = "",
): Promise<string> {
  const direct = await storage.url(storageKey);
  return (
    direct ?? withBasePath(`/_plumix/media/serve/${String(entryId)}`, basePath)
  );
}

// Translate `accept` into a SQL predicate against the JSON `mime` field. Real
// MIME strings don't contain LIKE wildcards and the input is plugin/agent
// supplied, so no escaping is needed.
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
