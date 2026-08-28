import type { AppContext } from "plumix/plugin";
import { loadSiteSettings, withBasePath } from "plumix";

import { loadSeoSettings, nonEmpty } from "./settings.js";
import { SITEMAP_INDEX_PATH } from "./sitemap.js";

/** Where the file answers, before any base prefix. */
export const LLMS_PATH = "/llms.txt";

// What a site says instead of a map when it has asked not to be read this way.
// The file is still served: a crawler that fetches it gets an answer rather
// than a 404 it would read as "nothing here yet".
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
 * `GET /llms.txt` — the llmstxt.org convention: a Markdown file naming the
 * site and pointing at what is worth reading.
 *
 * The map is offered only to a site that wants to be read by machines. One
 * held out of the index has nothing to offer a crawler, and one blocking AI
 * crawlers has said the opposite of what a map here would say — so both get
 * the heading and a sentence, not a list.
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
  const sitemap = `${ctx.origin}${withBasePath(SITEMAP_INDEX_PATH, ctx.basePath)}`;

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
