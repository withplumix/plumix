// From the root `plumix` specifier, the module augmented below, so the
// augmentation target loads in the plugin's own build.
import type {
  HydratedReference,
  LookupAdapter,
  LookupResult,
  ResolvedImage,
} from "plumix";
import type { SQL } from "plumix/db";
import type { Entry } from "plumix/schema";
import { and, desc, eq, inArray } from "plumix/db";
import { entries } from "plumix/schema";

import { parseMediaMeta } from "./meta.js";
import {
  buildAcceptCondition,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MEDIA_ENTRY_TYPE,
  queryMediaRows,
  resolveMediaUrl,
  thumbnailFor,
} from "./read-service.js";

const MEDIA_ROW_COLUMNS = {
  id: entries.id,
  title: entries.title,
  meta: entries.meta,
} as const;

/**
 * A string `accept` is a MIME prefix (`"image/"`, not HTML's `image/*`); an
 * array lists exact MIME types.
 */
export interface MediaFieldScope {
  readonly accept?: string | readonly string[];
}

/**
 * `id` stays the stored string id, so a hydrated value posted back through a
 * meta write heals to the plain id.
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

declare module "plumix" {
  interface ReferenceHydrationShapes {
    readonly media: MediaReference;
  }
}

/** Only published media surface: a draft's bytes are not verified yet. */
// `satisfies` keeps `hydrate`'s concrete `MediaReference` return type
// instead of widening it to `HydratedReference`.
export const mediaLookupAdapter = {
  async list(ctx, options) {
    const accept = options.scope?.accept;
    let rows: readonly Pick<Entry, "id" | "title" | "meta">[];
    if (options.ids !== undefined) {
      const numericIds = options.ids
        .map((id) => parseMediaId(id))
        .filter((id): id is number => id !== null);
      if (numericIds.length === 0) return [];
      const conditions: SQL[] = [
        eq(entries.type, MEDIA_ENTRY_TYPE),
        eq(entries.status, "published"),
        inArray(entries.id, numericIds),
      ];
      const acceptCondition = buildAcceptCondition(accept);
      if (acceptCondition) conditions.push(acceptCondition);
      rows = await ctx.db
        .select(MEDIA_ROW_COLUMNS)
        .from(entries)
        .where(and(...conditions))
        .orderBy(desc(entries.publishedAt), desc(entries.id))
        .limit(numericIds.length);
    } else {
      rows = await queryMediaRows(ctx, {
        accept,
        search: options.query?.trim(),
        limit: clampLimit(options.limit),
        offset: 0,
      });
    }

    const results: LookupResult[] = [];
    for (const row of rows) {
      const meta = parseMediaMeta(row.meta);
      if (!meta) continue;
      results.push(toLookupResult(row.id, row.title, meta.mime));
    }
    return results;
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
              ctx.config.basePath,
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

  image(payload: MediaReference): ResolvedImage | null {
    const { url, alt, mime, width, height } = payload;
    if (url === "" || !mime.startsWith("image/")) return null;
    return width !== null && height !== null
      ? { url, alt, width, height }
      : { url, alt };
  },
} satisfies LookupAdapter<MediaFieldScope>;

function parseMediaId(id: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(requested), MAX_PAGE_SIZE);
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
