import * as v from "valibot";

import type { AppContext, AuthenticatedAppContext } from "@plumix/core";
import { and, authenticated, base, desc, entries, eq } from "@plumix/core";

import { looksLikeMime, MAGIC_BYTE_SAMPLE_SIZE } from "./magic-bytes.js";
import { parseMediaMeta } from "./meta.js";
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
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
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

// Reject control characters and whitespace. Browsers send a bare
// `Content-Type: image/png` (no space, no parameters) when uploading
// a File via XHR; anything else here is a sign of a malformed client.
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
          throw errors.PAYLOAD_TOO_LARGE({
            data: { limit: options.maxUploadSize, received: input.size },
          });
        }
        // Normalize once at the entry point: strip parameters
        // (`; charset=utf-8`), lowercase. We compare against the
        // bare-mime allowlist; the worker-route's content-type check
        // also splits on `;`, so storing the bare form keeps both
        // sides in agreement.
        const normalizedMime = normalizeMime(input.contentType);
        if (!acceptedTypeSet.has(normalizedMime)) {
          throw errors.UNSUPPORTED_MEDIA_TYPE({
            data: { mime: normalizedMime },
          });
        }

        const storage = context.storage;
        if (!storage) {
          throw errors.CONFLICT({ data: { reason: "storage_not_configured" } });
        }

        const id = crypto.randomUUID();
        const ext =
          sanitizeExtension(input.filename) ?? extensionForMime(normalizedMime);
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
              mime: normalizedMime,
              size: input.size,
              originalName: input.filename,
              storageKey,
            },
          })
          .returning();
        if (!created) {
          throw errors.CONFLICT({ data: { reason: "db_insert_failed" } });
        }

        if (storage.presignPut) {
          let presigned;
          try {
            presigned = await storage.presignPut(storageKey, {
              contentType: normalizedMime,
              maxBytes: input.size,
              // 60s is plenty for a same-page XHR PUT and tightens the
              // replay window if the URL leaks (logs, browser history).
              expiresIn: 60,
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
        }

        // Worker-routed fallback — when the runtime has the binding
        // but no S3 credentials. Bytes flow through `env.MEDIA.put()`
        // and the upload-route enforces the size cap on the actual
        // stream, not just the Content-Length header.
        return {
          uploadUrl: `/_plumix/media/upload/${String(created.id)}`,
          method: "PUT",
          headers: { "content-type": normalizedMime },
          mediaId: created.id,
          storageKey,
          expiresAt: Math.floor(Date.now() / 1000) + 60,
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
        throw errors.FORBIDDEN({
          data: { capability: "entry:media:edit_any" },
        });
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

      // CAS the draft → published transition: the WHERE clause
      // includes `status = 'draft'`. Two concurrent confirms on the
      // same draft will race the sniff but exactly one will flip the
      // row; the loser sees `already_confirmed` instead of double-
      // publishing or stomping `publishedAt`.
      const [published] = await context.db
        .update(entries)
        .set({ status: "published", publishedAt: new Date() })
        .where(and(eq(entries.id, input.id), eq(entries.status, "draft")))
        .returning();
      if (!published) {
        throw errors.CONFLICT({ data: { reason: "already_confirmed" } });
      }

      const url = await resolveMediaUrl(storage, meta.storageKey, published.id);
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
          ? await resolveMediaUrl(context.storage, meta.storageKey, row.id)
          : meta.storageKey;
        items.push({
          id: row.id,
          title: row.title,
          mime: meta.mime,
          size: meta.size,
          storageKey: meta.storageKey,
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
        throw errors.FORBIDDEN({
          data: { capability: "entry:media:edit_any" },
        });
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
        throw errors.FORBIDDEN({ data: { capability: "entry:media:delete" } });
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

/**
 * Resolve a publicly-fetchable URL for a media row. Prefers the
 * storage adapter's native URL (presigned R2 / public bucket via
 * `publicUrlBase`); falls back to the worker-proxied serve route
 * keyed on the entry id when the bucket isn't publicly addressable.
 *
 * The id-based fallback is critical: keying on storageKey would
 * mean anyone with a key could fetch bytes (incl. drafts). Keying
 * on id lets the serve route enforce `status='published'`.
 */
async function resolveMediaUrl(
  storage: NonNullable<AppContext["storage"]>,
  storageKey: string,
  entryId: number,
): Promise<string> {
  const direct = await storage.url(storageKey);
  return direct ?? `/_plumix/media/serve/${String(entryId)}`;
}

function normalizeMime(raw: string): string {
  const semi = raw.indexOf(";");
  return (semi === -1 ? raw : raw.slice(0, semi)).trim().toLowerCase();
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
