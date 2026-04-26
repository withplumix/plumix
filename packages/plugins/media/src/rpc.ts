import * as v from "valibot";

import { authenticated, base, entries, eq } from "@plumix/core";

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
  readonly storageKey: string;
  readonly mime: string;
  readonly size: number;
}

interface MediaMeta {
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
}

// Reject control characters and whitespace inside `Content-Type`. They'd
// silently corrupt the SigV4 canonical-header block (and the browser
// would refuse to set the header anyway, breaking the upload). Validate
// at the boundary so the failure surfaces here instead of as a cryptic
// `403 SignatureDoesNotMatch` from R2.
const CONTENT_TYPE_RE = /^[\x21-\x7E]+$/;

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
          throw errors.CONFLICT({
            data: { reason: "payload_too_large" },
          });
        }
        if (!acceptedTypeSet.has(input.contentType)) {
          throw errors.CONFLICT({
            data: { reason: "unsupported_media_type", key: input.contentType },
          });
        }

        const storage = context.storage;
        if (!storage) {
          throw errors.CONFLICT({
            data: { reason: "storage_not_configured" },
          });
        }
        if (!storage.presignPut) {
          throw errors.CONFLICT({
            data: { reason: "presign_not_supported" },
          });
        }

        const id = crypto.randomUUID();
        const ext = pickExtension(input.filename, input.contentType);
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

        const presigned = await storage.presignPut(storageKey, {
          contentType: input.contentType,
          maxBytes: input.size,
          expiresIn: 600,
        });

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

      // Owner OR `edit_any` capability. We respond with NOT_FOUND for
      // both "row missing" and "you can't see it" so the procedure
      // doesn't leak existence to non-owners.
      const isOwner = row.authorId === context.user.id;
      if (!isOwner && !context.auth.can("entry:media:edit_any")) {
        throw notFound();
      }

      const meta = parseMediaMeta(row.meta);
      if (!meta) {
        throw errors.CONFLICT({ data: { reason: "media_meta_invalid" } });
      }

      // Verify the presigned PUT actually landed before flipping to
      // `published`. Without this, a client that called createUploadUrl
      // but never PUT bytes (or PUT to a different URL) would publish a
      // broken entry pointing at a 404.
      const storage = context.storage;
      if (!storage) {
        throw errors.CONFLICT({
          data: { reason: "storage_not_configured" },
        });
      }
      const head = await storage.head(meta.storageKey);
      if (!head) {
        throw errors.CONFLICT({ data: { reason: "object_not_found" } });
      }

      const [published] = await context.db
        .update(entries)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(entries.id, input.id))
        .returning();
      if (!published) throw notFound();

      return {
        id: published.id,
        url: await storage.url(meta.storageKey),
        storageKey: meta.storageKey,
        mime: meta.mime,
        size: meta.size,
      };
    });

  return { createUploadUrl, confirm };
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
  return { storageKey: r.storageKey, mime: r.mime, size: r.size };
}

const SAFE_EXT_RE = /^[a-z0-9]+$/;
const MAX_EXT_LEN = 10;

function pickExtension(filename: string, mime: string): string | undefined {
  const fromName = sanitizeExtension(filename);
  if (fromName !== undefined) return fromName;
  return extensionForMime(mime);
}

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
