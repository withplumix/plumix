import type { AppContext } from "@plumix/core";
import { and, entries, eq } from "@plumix/core";

const MEDIA_ENTRY_TYPE = "media";

interface MediaMeta {
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
}

/**
 * Worker-routed upload handler. Mounted at `PUT /_plumix/media/upload/<id>`
 * via `ctx.registerRoute({ path: "/upload/*", auth: "authenticated" })`.
 *
 * The dispatcher already authenticated the session before invoking us;
 * we still verify the draft belongs to the caller, the declared MIME
 * matches what `createUploadUrl` recorded, and the body fits inside the
 * size cap signed into the draft row.
 *
 * Streaming: `request.body` is a `ReadableStream<Uint8Array>` and we
 * pass it straight to `storage.put` — bytes never buffer in worker
 * memory, so the practical ceiling is the runtime's request-body cap
 * (Cloudflare Workers free: 100 MiB; paid: higher).
 */
export async function handleWorkerUpload(
  request: Request,
  ctx: AppContext,
): Promise<Response> {
  const user = ctx.user;
  if (!user) return jsonError(401, "unauthorized");

  const url = new URL(request.url);
  const idStr = url.pathname.split("/").pop() ?? "";
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) {
    return jsonError(400, "invalid_id");
  }

  const storage = ctx.storage;
  if (!storage) return jsonError(409, "storage_not_configured");

  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.type, MEDIA_ENTRY_TYPE)))
    .limit(1);
  if (!row) return jsonError(404, "not_found");
  if (row.status !== "draft") return jsonError(409, "not_a_draft");

  const isOwner = row.authorId === user.id;
  if (!isOwner && !ctx.auth.can("entry:media:edit_any")) {
    return jsonError(403, "forbidden");
  }

  const meta = parseMediaMeta(row.meta);
  if (!meta) return jsonError(409, "media_meta_invalid");

  const declared = request.headers.get("content-type") ?? "";
  // Browsers append `; charset=…` to text mimes — compare by base type.
  const declaredBase = declared.split(";")[0]?.trim().toLowerCase();
  if (declaredBase !== meta.mime.toLowerCase()) {
    return jsonError(415, "content_type_mismatch");
  }

  const declaredLengthHeader = request.headers.get("content-length");
  if (declaredLengthHeader !== null) {
    const declaredLength = Number(declaredLengthHeader);
    if (
      !Number.isFinite(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > meta.size
    ) {
      return jsonError(413, "payload_too_large");
    }
  }

  const body = request.body;
  if (!body) return jsonError(400, "empty_body");

  try {
    await storage.put(meta.storageKey, body, { contentType: meta.mime });
  } catch (error) {
    ctx.logger.warn("media_worker_upload_failed", {
      error,
      id,
      storageKey: meta.storageKey,
    });
    return jsonError(502, "storage_put_failed");
  }

  return new Response(null, { status: 204 });
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

function jsonError(status: number, reason: string): Response {
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
