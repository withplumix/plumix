import type { GetResult } from "plumix";
import type { AppContext } from "plumix/plugin";
import { and, eq, inArray } from "plumix/db";
import { entries } from "plumix/schema";

import type { CardImage, CardNode } from "./renderer.js";

/**
 * The card's tree with every image the plugin could not resolve removed, and
 * the bytes for the ones it could.
 */
export interface ResolvedCardImages {
  readonly node: CardNode;
  readonly images: readonly CardImage[];
}

/**
 * Resolve a card's images before anything renders, so the renderer is handed
 * bytes and never a URL to go and get.
 *
 * A `data:` URI carries its own bytes and stays as it is — the escape hatch for
 * a small inline asset such as a logo. Everything else has to come back through
 * the storage slot, either because the bucket addresses it directly or because
 * the media library proxies it. Anything left is dropped, not fetched, and the
 * card renders without it.
 */
export async function resolveCardImages(
  node: CardNode,
  ctx: AppContext,
): Promise<ResolvedCardImages> {
  const srcs = [...new Set(collectSrcs(node))];
  if (srcs.length === 0) return { node, images: [] };

  const images = await readImages(srcs, ctx);
  const resolved = new Set(images.map((image) => image.src));
  // A card whose whole tree is one unresolvable image still renders, so the
  // root falls back to an empty container rather than to nothing.
  return { node: prune(node, resolved) ?? { type: "container" }, images };
}

async function readImages(
  srcs: readonly string[],
  ctx: AppContext,
): Promise<CardImage[]> {
  const storage = ctx.storage;
  // No bucket is not a degraded render path: there is nowhere for an image to
  // have come from, so every card renders as if it referenced none.
  if (storage === undefined) return [];

  const [proxied, base] = await Promise.all([
    mediaKeys(srcs, ctx),
    // One `url("")` for the pass rather than one per image: the answer is the
    // bucket's public base, which does not vary by key.
    storage.url(""),
  ]);
  const read = await Promise.all(
    srcs.map(async (src) => {
      const key = proxied.get(src) ?? (await addressedKey(storage, base, src));
      if (key === null) return null;
      const object = await storage.get(key);
      if (object === null || !isRenderable(object)) return null;
      return { src, data: new Uint8Array(await object.arrayBuffer()) };
    }),
  );
  return read.filter((image) => image !== null);
}

// Bigger than any image belongs on a 1200x630 card, and the ceiling a render
// stays inside: the isolate has 128 MB and a decoded raster is several times
// its encoded size. Read off the object rather than the bytes, so an upload
// past it never reaches memory at all.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Whether an object is worth handing the engine. Non-image bytes are not a
 * degraded image — the engine throws on them, which takes down the whole card
 * rather than the one picture, so they are dropped like anything else it cannot
 * resolve. A backend that reports no content type is taken at its word.
 */
function isRenderable(object: GetResult): boolean {
  if (object.size > MAX_IMAGE_BYTES) return false;
  return object.contentType === undefined || isImageMime(object.contentType);
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

/**
 * The key behind a URL the storage slot itself would mint, or null. The slot is
 * the authority in both directions: a candidate key is read back out of the
 * `src`, and only a key whose public URL is that same `src` is the object the
 * card named — so nothing here turns a string into a read of another key.
 *
 * A backend whose URLs are not a base plus a key — one that signs them, say —
 * matches nothing and drops every image, which is the direction to fail in.
 */
async function addressedKey(
  storage: NonNullable<AppContext["storage"]>,
  base: string | null,
  src: string,
): Promise<string | null> {
  if (base === null || !src.startsWith(base)) return null;
  const key = decodePath(src.slice(base.length));
  if (key === null || key === "") return null;
  return (await storage.url(key)) === src ? key : null;
}

// Where the media plugin proxies an upload the bucket has no public URL for —
// the common shape on a private bucket. The path is that plugin's public
// contract; the row behind it is an ordinary entry, read here the way core
// reads a hydrated media reference: structurally, without importing the plugin.
const MEDIA_SERVE_PATH = "/_plumix/media/serve/";
const MEDIA_ENTRY_TYPE = "media";

/** Bucket keys for the proxied images a card referenced, keyed by `src`. */
async function mediaKeys(
  srcs: readonly string[],
  ctx: AppContext,
): Promise<ReadonlyMap<string, string>> {
  // Keyed by `src` rather than by id: a card naming the same upload twice, once
  // relative and once absolute, is two srcs the tree has to look both up by.
  const requested = new Map<string, number>();
  for (const src of srcs) {
    const id = mediaId(src, ctx);
    if (id !== null) requested.set(src, id);
  }
  if (requested.size === 0) return new Map();

  // Published-only, as the serve route is: a card is a public asset, and a
  // draft upload is not one.
  const rows = await ctx.db
    .select({ id: entries.id, meta: entries.meta })
    .from(entries)
    .where(
      and(
        eq(entries.type, MEDIA_ENTRY_TYPE),
        eq(entries.status, "published"),
        inArray(entries.id, [...new Set(requested.values())]),
      ),
    );

  const byId = new Map<number, string>();
  for (const row of rows) {
    const { storageKey, mime } = row.meta;
    if (typeof storageKey !== "string") continue;
    // An upload that is not an image is not a picture the engine can paint: it
    // throws on undecodable bytes, and a card that lost its whole render to one
    // is worse than a card that lost one image.
    if (typeof mime === "string" && isImageMime(mime)) {
      byId.set(row.id, storageKey);
    }
  }
  const keys = new Map<string, string>();
  for (const [src, id] of requested) {
    const key = byId.get(id);
    if (key !== undefined) keys.set(src, key);
  }
  return keys;
}

// 15 digits max keeps the parsed value below Number.MAX_SAFE_INTEGER.
const MEDIA_ID = /^[1-9]\d{0,14}$/;

// Parsed rather than string-matched: a `src` is resolved against the site's own
// origin, so a relative path and the absolute form of it are one URL, and
// `//elsewhere.example/_plumix/media/serve/1` is not.
function mediaId(src: string, ctx: AppContext): number | null {
  const url = URL.parse(src, ctx.origin);
  if (url === null || url.origin !== URL.parse(ctx.origin)?.origin) return null;
  const prefix = `${ctx.basePath}${MEDIA_SERVE_PATH}`;
  if (!url.pathname.startsWith(prefix)) return null;
  const id = url.pathname.slice(prefix.length);
  return MEDIA_ID.test(id) ? Number.parseInt(id, 10) : null;
}

// A `src` reaches here straight out of content, so a malformed escape is an
// input to reject rather than a throw on the render path.
function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isInline(src: string): boolean {
  return src.startsWith("data:");
}

function collectSrcs(node: CardNode): string[] {
  if (node.type === "image") return isInline(node.src) ? [] : [node.src];
  if (node.type !== "container") return [];
  return (node.children ?? []).flatMap(collectSrcs);
}

// Null where the image was dropped: its parent closes over the gap rather than
// keeping a node with nothing behind it.
function prune(node: CardNode, resolved: ReadonlySet<string>): CardNode | null {
  if (node.type === "image") {
    return isInline(node.src) || resolved.has(node.src) ? node : null;
  }
  if (node.type !== "container" || node.children === undefined) return node;
  return {
    ...node,
    children: node.children.flatMap((child) => prune(child, resolved) ?? []),
  };
}
