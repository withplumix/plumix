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
