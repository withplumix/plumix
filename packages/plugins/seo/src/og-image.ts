import type { OgImage, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { entryRoleImage } from "plumix";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Supply the page's `og:image`. Sits below an author's explicit
     * `.ogImage()` role — which short-circuits before this runs, so a
     * deliberate choice is never overridden — and above the entry's
     * `.featured()` photo and the site-wide default.
     *
     * Returning null, the value handed in, leaves the chain alone: the photo
     * is used, then the site default. Returning an image outranks both, so a
     * subscriber that only handles some pages must pass the value through on
     * the rest rather than answer for them.
     *
     * `featured` is that photo, passed alongside rather than as the value, so
     * a subscriber can improve on it — crop it to a social card's shape, say —
     * instead of only replacing it, and so that declining stays free.
     */
    "seo:og_image": (
      image: OgImage | null,
      data: TemplateData,
      ctx: AppContext,
      featured: OgImage | null,
    ) => OgImage | null | Promise<OgImage | null>;
  }
}

/**
 * The `og:image` for a request, resolved down the chain: the author's explicit
 * choice, then whatever a subscriber supplies, then the entry's photo, then the
 * site default.
 *
 * The order is fixed here rather than by subscription order, so a generated
 * card never outranks a deliberate choice however the `plugins` array happens
 * to be written.
 */
export async function resolveOgImage(
  ctx: AppContext,
  data: TemplateData,
  siteDefault: string | null,
): Promise<OgImage | null> {
  const explicit = entryRoleImage(ctx.plugins, data, "ogImage");
  if (explicit) return explicit;
  const featured = entryRoleImage(ctx.plugins, data, "featured");
  const filtered = await ctx.hooks.applyFilter(
    "seo:og_image",
    null,
    data,
    ctx,
    featured,
  );
  return filtered ?? featured ?? (siteDefault ? { url: siteDefault } : null);
}
