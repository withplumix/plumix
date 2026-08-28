import type { JsonObject } from "plumix";
import type { AppContext, PluginRegistry } from "plumix/plugin";

import { readSeoOverrides } from "./overrides.js";
import { nonEmpty } from "./settings.js";

// The reference kind `@plumix/plugin-media` registers. Named rather than
// imported: this plugin does not depend on that one, and a site with no media
// plugin simply resolves nothing.
const MEDIA_KIND = "media";

// One hydration query per 100 ids, the value core's own read path chunks to:
// D1 binds a parameter per id and caps a statement at 100, so a page of 1,000
// entries cannot go out as one `IN`.
const HYDRATE_CHUNK = 100;

// Image search reads a handful per URL, and a role-tagged field can be a
// `.multiple()` gallery — so the cap is what keeps a page of 1,000 entries
// from turning into tens of thousands of ids to resolve and list.
const MAX_IMAGES_PER_ENTRY = 10;

/**
 * The media-reference fields an entry type tags as a picture of the entry —
 * the same `.featured()` and `.ogImage()` roles the social-image chain reads,
 * so what a share shows and what image search finds come from one declaration.
 *
 * The walk is core's own `listEntryMetaFields` narrowed to those fields; that
 * one is not on the `plumix` barrel, so a plugin cannot call it.
 */
function imageFieldKeys(
  plugins: PluginRegistry,
  type: string,
): readonly string[] {
  const keys: string[] = [];
  for (const box of plugins.entryMetaBoxes.values()) {
    if (!box.entryTypes.includes(type)) continue;
    for (const field of box.fields) {
      if (field.role !== "featured" && field.role !== "ogImage") continue;
      if (!("referenceTarget" in field)) continue;
      if (field.referenceTarget.kind !== MEDIA_KIND) continue;
      keys.push(field.key);
    }
  }
  return keys;
}

/** The stored ids one bag holds for those keys — a single id, or a list. */
function mediaIdsOf(bag: JsonObject, keys: readonly string[]): string[] {
  const ids: string[] = [];
  for (const key of keys) {
    const value = bag[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      const id = nonEmpty(item);
      if (id !== null) ids.push(id);
      if (ids.length === MAX_IMAGES_PER_ENTRY) return ids;
    }
  }
  return ids;
}

/**
 * Every id resolved to its URL in one batched pass. Reads the payload
 * structurally — the hydrated shape belongs to the media plugin, and an
 * adapter without `hydrate`, or none at all, resolves nothing.
 *
 * Only pictures survive: the accept scope a field declares is not passed
 * through — one call batches ids from fields that may each declare a different
 * one — so a PDF or a video tagged `.featured()` is filtered on its own mime.
 */
async function mediaUrls(
  ctx: AppContext,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const urls = new Map<string, string>();
  const adapter = ctx.plugins.lookupAdapters.get(MEDIA_KIND)?.adapter;
  if (ids.length === 0 || adapter?.hydrate === undefined) return urls;
  for (let at = 0; at < ids.length; at += HYDRATE_CHUNK) {
    const payloads = await adapter.hydrate(ctx, {
      ids: ids.slice(at, at + HYDRATE_CHUNK),
    });
    for (const payload of payloads) {
      const mime = "mime" in payload ? nonEmpty(payload.mime) : null;
      if (!mime?.startsWith("image/")) continue;
      const url = "url" in payload ? nonEmpty(payload.url) : null;
      if (url !== null) urls.set(payload.id, url);
    }
  }
  return urls;
}

// A media URL is relative whenever the bucket has no public one and the worker
// proxies the file itself, and an editor may type a relative URL too — while a
// sitemap `<image:loc>` has to be absolute. Anything unparseable drops out.
function absolute(url: string | null, origin: string): string | null {
  return url === null ? null : (URL.parse(url, origin)?.href ?? null);
}

/**
 * The pictures each entry shows, positionally aligned with `bags` — one
 * batched hydration for the whole sitemap page rather than a query per entry.
 *
 * An editor's own social image URL leads, since it is the picture they chose;
 * the role-tagged fields follow in declaration order. Duplicates collapse, so
 * one photo named by two fields is listed once.
 */
export async function entryImages(
  ctx: AppContext,
  type: string,
  bags: readonly JsonObject[],
): Promise<readonly (readonly string[])[]> {
  const keys = imageFieldKeys(ctx.plugins, type);
  const ids = bags.map((bag) => mediaIdsOf(bag, keys));
  const urls = await mediaUrls(ctx, [...new Set(ids.flat())]);
  return bags.map((bag, index) => {
    const own = readSeoOverrides(bag).ogImage;
    const resolved = (ids[index] ?? []).map((id) => urls.get(id) ?? null);
    const pictures = [own, ...resolved].map((url) => absolute(url, ctx.origin));
    return [...new Set(pictures.filter((url) => url !== null))];
  });
}
