import type { AuthenticatedAppContext } from "plumix/plugin";
import {
  and,
  authenticated,
  base,
  entries,
  eq,
  withBasePath,
} from "plumix/plugin";
import * as v from "valibot";

import { looksLikeMime, MAGIC_BYTE_SAMPLE_SIZE } from "./magic-bytes.js";
import { parseMediaMeta } from "./meta.js";
import { extensionForMime } from "./mime.js";
import {
  listMedia,
  MEDIA_ENTRY_TYPE,
  mediaListInputSchema,
  MediaReadError,
  resolveMediaUrl,
  thumbnailFor,
} from "./read-service.js";

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

interface MediaRowGuards {
  readonly NOT_FOUND: (opts: {
    data: { kind: string; id: string | number };
  }) => Error;
  readonly FORBIDDEN: (opts: { data: { capability: string } }) => Error;
}

/**
 * Load a media-entry row and verify the caller is either the owner or
 * holds the supplied capability. Used by `update` and `remove`, which
 * share the same load + ownership pattern but differ on the capability
 * a non-owner needs.
 */
async function loadOwnedMediaRow(
  context: AuthenticatedAppContext,
  id: number,
  options: { readonly capability: string; readonly errors: MediaRowGuards },
): Promise<typeof entries.$inferSelect> {
  const { capability, errors } = options;
  const notFound = (): Error =>
    errors.NOT_FOUND({ data: { kind: "media", id } });

  const [row] = await context.db
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);
  if (row?.type !== MEDIA_ENTRY_TYPE) throw notFound();

  const isOwner = row.authorId === context.user.id;
  if (!isOwner && !context.auth.can(capability)) {
    throw errors.FORBIDDEN({ data: { capability } });
  }
  return row;
}

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
          uploadUrl: withBasePath(
            `/_plumix/media/upload/${String(created.id)}`,
            context.basePath,
          ),
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

      // Confirm is owner-only — `entry:media:edit_any` is for editing
      // existing assets, not finalizing someone else's drafts. A
      // non-owner shouldn't be able to publish another user's
      // half-completed upload.
      if (row.authorId !== context.user.id) {
        throw errors.FORBIDDEN({
          data: { capability: "entry:media:create" },
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

      // Size check — bytes are not signed into the SigV4 query, so
      // `meta.size` is just the client's claim at draft creation. Use
      // head() to verify the actually-stored bytes don't exceed it.
      const head = await storage.head(meta.storageKey);
      if (!head) {
        throw errors.CONFLICT({ data: { reason: "object_not_found" } });
      }
      if (head.size > meta.size) {
        await storage.delete(meta.storageKey);
        throw errors.PAYLOAD_TOO_LARGE({
          data: { limit: meta.size, received: head.size },
        });
      }

      // Verify the bytes match the claimed mime via magic-byte sniff.
      // Delete on mismatch so an attacker can't force-leave junk in
      // the bucket between a forged claim and our detection.
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

      const url = await resolveMediaUrl(
        storage,
        meta.storageKey,
        published.id,
        context.basePath,
      );
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
    .input(mediaListInputSchema)
    .handler(async ({ input, context, errors }) => {
      try {
        return await listMedia(context, input);
      } catch (error) {
        throw mapMediaReadError(error, errors);
      }
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
      const row = await loadOwnedMediaRow(context, input.id, {
        capability: "entry:media:edit_any",
        errors,
      });

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
      const row = await loadOwnedMediaRow(context, input.id, {
        capability: "entry:media:delete",
        errors,
      });

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

// Map a media-read domain error to the oRPC typed error to throw; non-domain
// errors pass through for the caller to rethrow.
function mapMediaReadError(error: unknown, errors: MediaRowGuards): unknown {
  if (!(error instanceof MediaReadError)) return error;
  switch (error.data.code) {
    case "forbidden":
      return errors.FORBIDDEN({ data: { capability: error.data.capability } });
    case "not_found":
      return errors.NOT_FOUND({ data: { kind: "media", id: error.data.id } });
  }
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
