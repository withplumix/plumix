import type { AppContext } from "plumix/plugin";
import { loadSiteSettings } from "plumix/plugin";

import { loadSeoSettings, nonEmpty } from "./settings.js";
import { sitemapIndexUrl } from "./sitemap.js";

/** Where the file answers, before any base prefix. */
export const LLMS_PATH = "/llms.txt";

// Still served, so a crawler doesn't read a 404 as "nothing here yet".
const WITHHELD =
  "This site's content is not offered for AI training or retrieval.";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Adjust the generated `/llms.txt` body — list the pages that matter,
     * add a section, or replace it outright without owning the route.
     */
    "seo:llms-txt": (body: string) => string | Promise<string>;
  }
}

/**
 * A site held out of the index or blocking AI crawlers gets the heading and a
 * sentence, not the map.
 */
export async function handleLlmsTxt(ctx: AppContext): Promise<Response> {
  const [site, seo] = await Promise.all([
    loadSiteSettings(ctx),
    loadSeoSettings(ctx),
  ]);
  // A heading is the one part of the file that is never absent, so the host
  // stands in for a site that never filled its title in.
  const title = nonEmpty(site.title) ?? new URL(ctx.origin).host;
  const tagline = nonEmpty(site.tagline);
  const sitemap = sitemapIndexUrl(ctx);

  const heading = `# ${title}\n`;
  const intro = tagline === null ? "" : `\n> ${tagline}\n`;
  const map =
    seo.indexable && !seo.blockAiCrawlers
      ? `\n## Sitemap\n\n- [XML sitemap](${sitemap}): every URL this site offers to search engines.\n`
      : `\n${WITHHELD}\n`;
  const body = await ctx.hooks.applyFilter(
    "seo:llms-txt",
    heading + intro + map,
  );
  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
