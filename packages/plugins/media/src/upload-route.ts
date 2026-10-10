import type { AppContext } from "plumix/plugin";
import { and, eq } from "plumix/db";
import { entries } from "plumix/schema";

import { parseMediaMeta } from "./meta.js";
import { canFinishUpload } from "./upload-gate.js";

const MEDIA_ENTRY_TYPE = "media";

// Anchored: digits only, no leading zeros, ≤16 chars (well above any
// realistic SQLite int). Rejects scientific notation, signs, padding
// whitespace, and unicode digits.
const ID_RE = /^[1-9]\d{0,15}$/;

/**
 * Refuses a body without `Content-Length` or above the size declared at draft
 * creation. CSRF is checked by the `/_plumix/*` dispatcher, not here.
 */
export async function handleWorkerUpload(
  request: Request,
  ctx: AppContext,
): Promise<Response> {
  const user = ctx.user;
  if (!user) return jsonError(401, "unauthorized");

  const url = new URL(request.url);
  const idStr = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  if (!ID_RE.test(idStr)) return jsonError(400, "invalid_id");
  const id = Number.parseInt(idStr, 10);

  // Reject `/upload/<id>/<extra>` — the route is mounted via "/upload/*"
  // wildcard, so we have to enforce shape here.
  if (url.pathname !== `/_plumix/media/upload/${idStr}`) {
    return jsonError(400, "invalid_path");
  }

  const storage = ctx.storage;
  if (!storage) return jsonError(503, "storage_not_configured");

  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.type, MEDIA_ENTRY_TYPE)))
    .limit(1);
  if (!row) return jsonError(404, "not_found");
  if (row.status !== "draft") return jsonError(409, "not_a_draft");

  if (!canFinishUpload(ctx, row)) return jsonError(403, "forbidden");

  const meta = parseMediaMeta(row.meta);
  if (!meta) return jsonError(409, "media_meta_invalid");

  const declared = request.headers.get("content-type") ?? "";
  const declaredBase = declared.split(";")[0]?.trim().toLowerCase();
  if (declaredBase !== meta.mime.toLowerCase()) {
    return jsonError(415, "content_type_mismatch");
  }

  // Reject missing CL (chunked is unbounded) or CL > meta.size; HTTP
  // framing truncates the actual stream to the declared length.
  const declaredLengthHeader = request.headers.get("content-length");
  if (declaredLengthHeader === null) {
    return jsonError(411, "content_length_required");
  }
  const declaredLength = Number(declaredLengthHeader);
  if (
    !Number.isInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > meta.size
  ) {
    return jsonError(413, "payload_too_large");
  }

  const body = request.body;
  if (!body) return jsonError(400, "empty_body");

  // Stream the body straight to R2 per the docs example:
  //   await env.R2.put(key, request.body, { httpMetadata })
  try {
    await storage.put(meta.storageKey, body, { contentType: meta.mime });
  } catch (error) {
    // Best-effort cleanup — a partial put can leave junk behind.
    try {
      await storage.delete(meta.storageKey);
    } catch (cleanupError) {
      ctx.logger.warn("media_worker_upload_cleanup_failed", {
        error: cleanupError,
        key: meta.storageKey,
      });
    }
    ctx.logger.warn("media_worker_upload_failed", {
      error,
      id,
      storageKey: meta.storageKey,
    });
    return jsonError(502, "storage_put_failed");
  }

  return new Response(null, { status: 204 });
}

function jsonError(status: number, reason: string): Response {
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
