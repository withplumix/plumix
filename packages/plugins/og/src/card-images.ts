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
 * The renderer never fetches a URL. `data:` URIs pass through; other images
 * must resolve through the storage slot or media proxy, or are dropped.
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

// The isolate has 128 MB and a decoded raster is several times its encoded
// size. Checked on object metadata, so an oversized upload never reaches
// memory.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// The engine throws on non-image bytes, losing the whole card rather than one
// picture. A missing content type is trusted.
function isRenderable(object: GetResult): boolean {
  if (object.size > MAX_IMAGE_BYTES) return false;
  return object.contentType === undefined || isImageMime(object.contentType);
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

// A candidate key counts only if the slot mints that same `src` back, so no
// string becomes a read of another key. Signed URLs match nothing, failing
// safe.
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

// The media plugin's public proxy path, read structurally so this plugin
// needn't import it.
const MEDIA_SERVE_PATH = "/_plumix/media/serve/";
const MEDIA_ENTRY_TYPE = "media";

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
    // The engine throws on undecodable bytes, losing the whole card.
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
  const prefix = `${ctx.config.basePath}${MEDIA_SERVE_PATH}`;
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
