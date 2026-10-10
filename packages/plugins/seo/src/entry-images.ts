import type { JsonObject } from "plumix";
import type { AppContext } from "plumix/plugin";
import { resolveImageRoles } from "plumix/plugin";

import { readSeoOverrides } from "./overrides.js";

// A sitemap `<image:loc>` must be absolute but media URLs can be relative. The
// empty string is dropped because `URL` resolves it to the site root.
function absolute(url: string | null, origin: string): string | null {
  if (url === null || url === "") return null;
  return URL.parse(url, origin)?.href ?? null;
}

/**
 * Positionally aligned with `bags`. The editor's social image leads; role
 * images follow in no promised order, deduplicated.
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
