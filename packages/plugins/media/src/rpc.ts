import * as v from "valibot";

import type { AppContext, AuthenticatedAppContext } from "@plumix/core";
import { and, authenticated, base, desc, entries, eq } from "@plumix/core";

import { looksLikeMime, MAGIC_BYTE_SAMPLE_SIZE } from "./magic-bytes.js";
import { extensionForMime } from "./mime.js";

const MEDIA_ENTRY_TYPE = "media";

interface MediaRpcOptions {
  readonly acceptedTypes: readonly string[];
  readonly maxUploadSize: number;
}

interface CreateUploadUrlResponse {
  readonly uploadUrl: string;
  readonly method: "PUT";
  readonly headers: Readonly<Record<string, string>>;
  readonly mediaId: number;
  readonly storageKey: string;
  readonly expiresAt: number;
}

interface ConfirmResponse {
  readonly id: number;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly storageKey: string;
  readonly mime: string;
  readonly size: number;
}

interface MediaListItem {
  readonly id: number;
  readonly title: string;
  readonly slug: string;
  readonly status: "draft" | "published" | "scheduled" | "trash";
  readonly authorId: number;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
  readonly originalName: string | null;
  readonly alt: string | null;
  readonly url: string;
  readonly thumbnailUrl: string;
}

interface MediaListResponse {
  readonly items: readonly MediaListItem[];
  readonly hasMore: boolean;
}

interface DeleteResponse {
  readonly id: number;
}

interface UpdateResponse {
  readonly id: number;
  readonly title: string;
  readonly alt: string | null;
}

interface MediaMeta {
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
  readonly originalName: string | null;
  readonly alt: string | null;
}

// Reject control characters and whitespace inside `Content-Type`. They'd
// silently corrupt the SigV4 canonical-header block (and the browser
// would refuse to set the header anyway, breaking the upload). Validate
// at the boundary so the failure surfaces here instead of as a cryptic
// `403 SignatureDoesNotMatch` from R2.
const CONTENT_TYPE_RE = /^[\x21-\x7E]+$/;

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

// Default thumbnail variant the admin grid renders. 320px-wide AVIF/WebP
// is enough for the 160px card under 2× DPI; format=auto lets Cloudflare
// negotiate via `Accept`.
const THUMBNAIL_OPTS = {
  width: 320,
  format: "auto",
  fit: "cover",
} as const;

export function createMediaRouter(
  options: MediaRpcOptions,
): Record<string, unknown> {
  const acceptedTypeSet = new Set(options.acceptedTypes);

  // Capability gating already keeps `entry:media:create` to the
  // contributor+ tier (`registerEntryType` derives it). For at-scale
  // deployments add a per-user quota or rate limit on this procedure —
  // a single contributor can otherwise mint as many presigned URLs as
  // they like and fill the bucket. Tracked as follow-up work; the
  // server-side draft GC + KV-backed counter belong here.
  const createUploadUrl = base
    .use(authenticated)
    .input(
      v.object({
        filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
        contentType: v.pipe(
          v.string(),
          v.minLength(1),
          v.maxLength(255),
          v.regex(CONTENT_TYPE_RE),
        ),
        size: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    )
    .handler(
      async ({ input, context, errors }): Promise<CreateUploadUrlResponse> => {
        if (!context.auth.can("entry:media:create")) {
          throw errors.FORBIDDEN({
            data: { capability: "entry:media:create" },
          });
        }
        if (input.size > options.maxUploadSize) {
          throw errors.CONFLICT({ data: { reason: "payload_too_large" } });
        }
        if (!acceptedTypeSet.has(input.contentType)) {
          throw errors.CONFLICT({
            data: { reason: "unsupported_media_type", key: input.contentType },
          });
        }

        const storage = context.storage;
        if (!storage) {
          throw errors.CONFLICT({ data: { reason: "storage_not_configured" } });
        }
        if (!storage.presignPut) {
          throw errors.CONFLICT({ data: { reason: "presign_not_supported" } });
        }

        const id = crypto.randomUUID();
        const ext =
          sanitizeExtension(input.filename) ??
          extensionForMime(input.contentType);
        const datePrefix = new Date()
          .toISOString()
          .slice(0, 7)
          .replace("-", "/");
        const storageKey =
          ext === undefined
            ? `${datePrefix}/${id}`
            : `${datePrefix}/${id}.${ext}`;

        const [created] = await context.db
          .insert(entries)
          .values({
            type: MEDIA_ENTRY_TYPE,
            title: input.filename,
            slug: id,
            status: "draft",
            authorId: context.user.id,
            meta: {
              mime: input.contentType,
              size: input.size,
              originalName: input.filename,
              storageKey,
            },
          })
          .returning();
        if (!created) {
          throw errors.CONFLICT({ data: { reason: "db_insert_failed" } });
        }

        // If the presign step throws after the draft row landed (bad
        // creds, S3 endpoint unreachable, …) the row would otherwise
        // leak forever. Roll it back before propagating.
        let presigned;
        try {
          presigned = await storage.presignPut(storageKey, {
            contentType: input.contentType,
            maxBytes: input.size,
            expiresIn: 600,
          });
        } catch (error) {
          await context.db.delete(entries).where(eq(entries.id, created.id));
          throw error;
        }

        return {
          uploadUrl: presigned.url,
          method: presigned.method,
          headers: presigned.headers,
          mediaId: created.id,
          storageKey,
          expiresAt: presigned.expiresAt,
        };
      },
    );

  const confirm = base
    .use(authenticated)
    .input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
    .handler(async ({ input, context, errors }): Promise<ConfirmResponse> => {
      const notFound = (): Error =>
        errors.NOT_FOUND({ data: { kind: "media", id: input.id } });

      const [row] = await context.db
        .select()
        .from(entries)
        .where(eq(entries.id, input.id))
        .limit(1);
      if (row?.type !== MEDIA_ENTRY_TYPE) throw notFound();

      const isOwner = row.authorId === context.user.id;
      if (!isOwner && !context.auth.can("entry:media:edit_any")) {
        throw notFound();
      }

      const meta = parseMediaMeta(row.meta);
      if (!meta) {
        throw errors.CONFLICT({ data: { reason: "media_meta_invalid" } });
      }

      const storage = context.storage;
      if (!storage) {
        throw errors.CONFLICT({ data: { reason: "storage_not_configured" } });
      }

      // Verify the presigned PUT actually landed AND defend against MIME
      // confusion in one round-trip: a ranged read returns null if the
      // object is missing, otherwise hands us the first bytes to check
      // against the claimed content-type. The bucket stores whatever the
      // upload signed, so if a client claimed `image/png` but uploaded
      // arbitrary bytes, we'd serve them as PNG forever. Delete on
      // mismatch so an attacker can't force-leave junk in the bucket
      // between a forged claim and our detection.
      const sampleObj = await storage.get(meta.storageKey, {
        range: { offset: 0, length: MAGIC_BYTE_SAMPLE_SIZE },
      });
      if (!sampleObj) {
        throw errors.CONFLICT({ data: { reason: "object_not_found" } });
      }
      const sample = new Uint8Array(await sampleObj.arrayBuffer());
      if (!looksLikeMime(sample, meta.mime)) {
        await storage.delete(meta.storageKey);
        throw errors.CONFLICT({ data: { reason: "mime_mismatch" } });
      }

      const [published] = await context.db
        .update(entries)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(entries.id, input.id))
        .returning();
      if (!published) throw notFound();

      const url = await storage.url(meta.storageKey);
      return {
        id: published.id,
        url,
        thumbnailUrl: thumbnailFor(context, url, meta.mime),
        storageKey: meta.storageKey,
        mime: meta.mime,
        size: meta.size,
      };
    });

  const list = base
    .use(authenticated)
    .input(
      v.object({
        limit: v.optional(
          v.pipe(
            v.number(),
            v.integer(),
            v.minValue(1),
            v.maxValue(MAX_PAGE_SIZE),
          ),
          DEFAULT_PAGE_SIZE,
        ),
        offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
      }),
    )
    .handler(async ({ input, context, errors }): Promise<MediaListResponse> => {
      if (!context.auth.can("entry:media:read")) {
        throw errors.FORBIDDEN({ data: { capability: "entry:media:read" } });
      }
      // Fetch one extra row so we can report `hasMore` without a
      // separate COUNT(*) query.
      const rows = await context.db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.type, MEDIA_ENTRY_TYPE),
            eq(entries.status, "published"),
          ),
        )
        .orderBy(desc(entries.updatedAt), desc(entries.id))
        .limit(input.limit + 1)
        .offset(input.offset);
      const hasMore = rows.length > input.limit;
      const visibleRows = hasMore ? rows.slice(0, input.limit) : rows;

      const items: MediaListItem[] = [];
      for (const row of visibleRows) {
        const meta = parseMediaMeta(row.meta);
        if (!meta) continue;
        const url = context.storage
          ? await context.storage.url(meta.storageKey)
          : meta.storageKey;
        items.push({
          id: row.id,
          title: row.title,
          slug: row.slug,
          status: row.status,
          authorId: row.authorId,
          publishedAt: row.publishedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          mime: meta.mime,
          size: meta.size,
          storageKey: meta.storageKey,
          originalName: meta.originalName,
          alt: meta.alt,
          url,
          thumbnailUrl: thumbnailFor(context, url, meta.mime),
        });
      }
      return { items, hasMore };
    });

  const update = base
    .use(authenticated)
    .input(
      v.object({
        id: v.pipe(v.number(), v.integer(), v.minValue(1)),
        title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
        alt: v.optional(v.pipe(v.string(), v.maxLength(1024))),
      }),
    )
    .handler(async ({ input, context, errors }): Promise<UpdateResponse> => {
      const notFound = (): Error =>
        errors.NOT_FOUND({ data: { kind: "media", id: input.id } });

      const [row] = await context.db
        .select()
        .from(entries)
        .where(eq(entries.id, input.id))
        .limit(1);
      if (row?.type !== MEDIA_ENTRY_TYPE) throw notFound();

      const isOwner = row.authorId === context.user.id;
      if (!isOwner && !context.auth.can("entry:media:edit_any")) {
        throw notFound();
      }

      const meta = parseMediaMeta(row.meta);
      if (!meta) {
        throw errors.CONFLICT({ data: { reason: "media_meta_invalid" } });
      }

      const nextMeta = {
        mime: meta.mime,
        size: meta.size,
        storageKey: meta.storageKey,
        originalName: meta.originalName,
        alt: input.alt ?? meta.alt,
      };
      const [updated] = await context.db
        .update(entries)
        .set({
          title: input.title ?? row.title,
          meta: nextMeta,
        })
        .where(eq(entries.id, input.id))
        .returning();
      if (!updated) throw notFound();

      return {
        id: updated.id,
        title: updated.title,
        alt: nextMeta.alt,
      };
    });

  const remove = base
    .use(authenticated)
    .input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
    .handler(async ({ input, context, errors }): Promise<DeleteResponse> => {
      const notFound = (): Error =>
        errors.NOT_FOUND({ data: { kind: "media", id: input.id } });

      const [row] = await context.db
        .select()
        .from(entries)
        .where(eq(entries.id, input.id))
        .limit(1);
      if (row?.type !== MEDIA_ENTRY_TYPE) throw notFound();

      const isOwner = row.authorId === context.user.id;
      if (!isOwner && !context.auth.can("entry:media:delete")) {
        throw notFound();
      }

      // Delete the row first, then the bytes. If the storage delete
      // fails we'd rather leave an orphan in the bucket (admin can
      // sweep) than a row pointing at a deleted file (which would
      // surface as a permanent broken card). DB delete is the
      // authoritative state.
      const [deleted] = await context.db
        .delete(entries)
        .where(eq(entries.id, input.id))
        .returning();
      if (!deleted) throw notFound();

      const meta = parseMediaMeta(row.meta);
      if (meta && context.storage) {
        try {
          await context.storage.delete(meta.storageKey);
        } catch (error) {
          context.logger.warn("media_delete_storage_failed", {
            error,
            id: row.id,
            storageKey: meta.storageKey,
          });
        }
      }

      return { id: deleted.id };
    });

  return { createUploadUrl, confirm, list, update, delete: remove };
}

function thumbnailFor(
  context: AppContext | AuthenticatedAppContext,
  url: string,
  mime: string,
): string {
  if (!mime.startsWith("image/") || !context.imageDelivery) return url;
  return context.imageDelivery.url(url, THUMBNAIL_OPTS);
}

function parseMediaMeta(raw: unknown): MediaMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.storageKey !== "string" ||
    typeof r.mime !== "string" ||
    typeof r.size !== "number"
  ) {
    return null;
  }
  return {
    storageKey: r.storageKey,
    mime: r.mime,
    size: r.size,
    originalName: typeof r.originalName === "string" ? r.originalName : null,
    alt: typeof r.alt === "string" ? r.alt : null,
  };
}

const SAFE_EXT_RE = /^[a-z0-9]+$/;
const MAX_EXT_LEN = 10;

function sanitizeExtension(filename: string): string | undefined {
  const lastDot = filename.lastIndexOf(".");
  // `lastDot === 0` means the name starts with a dot (`.bashrc`) — that's
  // a dotfile, not a `name.ext` shape. Treat as no extension.
  if (lastDot <= 0 || lastDot === filename.length - 1) return undefined;
  const ext = filename.slice(lastDot + 1).toLowerCase();
  if (ext.length > MAX_EXT_LEN) return undefined;
  if (!SAFE_EXT_RE.test(ext)) return undefined;
  return ext;
}
