import type { JsonObject } from "plumix";
import type { AppContext } from "plumix/plugin";
import { resolveImageRoles } from "plumix/plugin";

import { readSeoOverrides } from "./overrides.js";

// A media URL is relative whenever the bucket has no public one and the worker
// proxies the file itself, and an editor may type a relative URL too — while a
// sitemap `<image:loc>` has to be absolute. Anything unparseable drops out.
function absolute(url: string | null, origin: string): string | null {
  return url === null ? null : (URL.parse(url, origin)?.href ?? null);
}

/**
 * The pictures each entry shows, positionally aligned with `bags` — every
 * image role the entry's type declares a field in, out of one batched
 * hydration for the whole sitemap page rather than a query per entry.
 *
 * An editor's own social image URL leads, since it is the picture they chose;
 * the roles follow, one image each, in no order this promises — an image
 * sitemap does not rank what it lists. Duplicates collapse, so one photo named
 * by two roles is listed once.
 *
 * What counts as a picture is the reference adapter's own answer: a role field
 * holding a PDF resolves to nothing, so this never sniffs a payload's mime.
 */
export async function entryImages(
  ctx: AppContext,
  type: string,
  bags: readonly JsonObject[],
): Promise<readonly (readonly string[])[]> {
  const roles = await resolveImageRoles(
    ctx,
    { kind: "entry", entryType: type },
    bags,
  );
  return bags.map((bag, index) => {
    const own = readSeoOverrides(bag).ogImage;
    const resolved = Object.values(roles[index] ?? {}).flatMap(
      (image) => image?.url ?? [],
    );
    const pictures = [own, ...resolved].map((url) => absolute(url, ctx.origin));
    return [...new Set(pictures.filter((url) => url !== null))];
  });
}
