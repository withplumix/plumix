import type { AppContext } from "@plumix/core";
import { and, entries, eq } from "@plumix/core";

import { parseMediaMeta } from "./meta.js";

const PREFIX = "/_plumix/media/serve/";
const MEDIA_ENTRY_TYPE = "media";

// Mimes safe to render inline same-origin. Everything else gets
// `Content-Disposition: attachment` to force download — defense
// against stored-XSS via uploaded content (text/html in a `.txt`,
// scripted SVG, polyglot bytes).
const INLINE_SAFE_MIMES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

/**
 * Worker-proxied media serve. Mounted at `GET /_plumix/media/serve/<id>`
 * via `ctx.registerRoute({ path: "/serve/*", auth: "public" })`.
 *
 * Public on purpose — published media is meant to be embeddable in
 * pages/posts. Three guards:
 *
 * 1. **Published-only**: looks up `entries` by id and requires
 *    `type='media' AND status='published'`. Drafts and trashed rows
 *    return 404.
 * 2. **Mime sandboxing**: `X-Content-Type-Options: nosniff` always;
 *    `Content-Disposition: attachment` for any mime not in the
 *    inline-safe allowlist (forces download instead of render).
 * 3. **Etag round-trip**: 304 on `If-None-Match` match so the worker
 *    isn't re-streaming bytes for every page view.
 */
export async function handleMediaServe(
  request: Request,
  ctx: AppContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) {
    return new Response(null, { status: 404 });
  }
  const idStr = url.pathname.slice(PREFIX.length);
  if (!/^[1-9]\d{0,15}$/.test(idStr)) {
    return new Response(null, { status: 400 });
  }
  const id = Number.parseInt(idStr, 10);

  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.id, id),
        eq(entries.type, MEDIA_ENTRY_TYPE),
        eq(entries.status, "published"),
      ),
    )
    .limit(1);
  if (!row) return new Response(null, { status: 404 });

  const meta = parseMediaMeta(row.meta);
  if (!meta) return new Response(null, { status: 404 });

  const storage = ctx.storage;
  if (!storage) return new Response(null, { status: 503 });

  const obj = await storage.get(meta.storageKey);
  if (!obj) return new Response(null, { status: 404 });

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && obj.etag && weakEtagMatch(ifNoneMatch, obj.etag)) {
    return new Response(null, {
      status: 304,
      headers: { etag: obj.etag, "cache-control": cacheControl() },
    });
  }

  const headers = new Headers();
  headers.set("content-type", meta.mime);
  headers.set("content-length", String(obj.size));
  headers.set("cache-control", cacheControl());
  headers.set("x-content-type-options", "nosniff");
  if (obj.etag) headers.set("etag", obj.etag);
  if (!INLINE_SAFE_MIMES.has(meta.mime)) {
    const filename = sanitizeFilename(row.title);
    headers.set("content-disposition", `attachment; filename="${filename}"`);
  }

  return new Response(obj.body, { status: 200, headers });
}

function cacheControl(): string {
  // Short cache + revalidate. Long max-age + key reuse (alt updates
  // don't change bytes; future replace-file flows might) leaves
  // intermediaries serving stale bytes for hours.
  return "public, max-age=60, must-revalidate";
}

function weakEtagMatch(ifNoneMatch: string, etag: string): boolean {
  // `If-None-Match` accepts comma-separated tags; either side may be
  // weak (`W/"..."`). Normalize and check membership.
  const normalize = (s: string): string => s.replace(/^W\//, "").trim();
  const target = normalize(etag);
  return ifNoneMatch
    .split(",")
    .map((t) => normalize(t))
    .some((t) => t === target || t === "*");
}

const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]/g;
function sanitizeFilename(title: string): string {
  // Strip anything that could break the Content-Disposition quoting
  // or attempt directory traversal in the suggested name. ASCII-safe
  // subset; non-ASCII titles fall back to a stable placeholder.
  const cleaned = title.replace(SAFE_FILENAME_RE, "_").slice(0, 100);
  return cleaned.length > 0 ? cleaned : "download";
}
