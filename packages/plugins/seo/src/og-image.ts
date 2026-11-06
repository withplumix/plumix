import type { TemplateData } from "plumix";
import type { AppContext, ImageRoleName, OgImage } from "plumix/plugin";

import { seoFilters } from "./events.js";

function roleImage(data: TemplateData, role: ImageRoleName): OgImage | null {
  return data.kind === "entry" ? (data.entry.images[role] ?? null) : null;
}

/**
 * The two links of the chain that come from stored answers rather than code.
 */
export interface OgImageChain {
  /** The URL the editor typed into the SEO box for this entry or term. */
  readonly override: string | null;
  /** The last link: the site-wide default. */
  readonly siteDefault: string | null;
}

/**
 * Fixed order regardless of plugin order: the author's choice, a subscriber's
 * answer, the entry's photo, the site default.
 */
export async function resolveOgImage(
  ctx: AppContext,
  data: TemplateData,
  chain: OgImageChain,
): Promise<OgImage | null> {
  const explicit = roleImage(data, "ogImage");
  if (explicit) return explicit;
  // Above the filter for the same reason the role marker is: an editor who
  // named a picture has answered, and a generated card must not overrule them.
  if (chain.override) return { url: chain.override };
  const featured = roleImage(data, "featured");
  const filtered = await ctx.filters.apply(seoFilters.ogImage, null, {
    data,
    featured,
  });
  return (
    filtered ??
    featured ??
    (chain.siteDefault ? { url: chain.siteDefault } : null)
  );
}
