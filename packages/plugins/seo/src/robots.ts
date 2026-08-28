import type { AppContext } from "plumix/plugin";

import { loadSeoSettings } from "./settings.js";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Adjust the generated `/robots.txt` body — add `Sitemap:` lines, a
     * crawl-delay, or per-agent rules without owning the route.
     */
    "seo:robots-txt": (body: string) => string | Promise<string>;
  }
}

/** `GET /robots.txt` — an indexable site allows all crawling, one held out of the index allows none. */
export async function handleRobotsTxt(ctx: AppContext): Promise<Response> {
  const { indexable } = await loadSeoSettings(ctx);
  const body = await ctx.hooks.applyFilter(
    "seo:robots-txt",
    `User-agent: *\n${indexable ? "Disallow:" : "Disallow: /"}\n`,
  );
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
