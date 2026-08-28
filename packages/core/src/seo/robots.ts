import type { AppContext } from "../context/app.js";
import { loadSiteSettings } from "./site-settings.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Adjust the generated `/robots.txt` body. The value filter for plugins
     * (e.g. `@plumix/plugin-seo`) to add `Sitemap:` lines, crawl-delay, or
     * per-agent rules without owning the route.
     */
    "seo:robots-txt": (body: string) => string | Promise<string>;
  }
}

/**
 * The `robots.txt` body. Default-public allows all crawling; a private site
 * (the `site.public` setting off) disallows everything.
 */
export function buildRobotsTxt(options: {
  readonly isPublic: boolean;
}): string {
  const rule = options.isPublic ? "Disallow:" : "Disallow: /";
  return `User-agent: *\n${rule}\n`;
}

// `site.public` has no writer left in the product — the toggle moved into
// `@plumix/plugin-seo`'s own settings group (#1997). The row is still read here
// so an existing private site stays private, and this surface follows the
// toggle again when it moves into that plugin: #1998 for robots.txt and the
// sitemap, #1996 for feeds. Both land on the same integration branch as #1997,
// so the split never reaches a release.
export async function handleRobotsTxt(ctx: AppContext): Promise<Response> {
  const site = await loadSiteSettings(ctx);
  const isPublic = site.public !== false;
  const body = await ctx.hooks.applyFilter(
    "seo:robots-txt",
    buildRobotsTxt({ isPublic }),
  );
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
