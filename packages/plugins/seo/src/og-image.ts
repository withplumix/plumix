import type { TemplateData } from "plumix";
import type { AppContext, ImageRoleName, OgImage } from "plumix/plugin";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Not called when the author chose an image. Returning an image outranks
     * `featured` and the site default, so pass the value through on pages you
     * don't handle.
     */
    "seo:og_image": (
      image: OgImage | null,
      data: TemplateData,
      ctx: AppContext,
      featured: OgImage | null,
    ) => OgImage | null | Promise<OgImage | null>;
  }
}

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
  const filtered = await ctx.hooks.applyFilter(
    "seo:og_image",
    null,
    data,
    ctx,
    featured,
  );
  return (
    filtered ??
    featured ??
    (chain.siteDefault ? { url: chain.siteDefault } : null)
  );
}
