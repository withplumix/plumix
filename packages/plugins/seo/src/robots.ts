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

/**
 * The agents a site blocks by answering "block AI crawlers" — the crawlers
 * that feed model training and assistant answers, as each vendor documents its
 * own token. A search engine's ordinary indexing crawler is deliberately not
 * here: blocking those is what turning indexing off does.
 *
 * One group with many `User-agent` lines rather than a block each, which is
 * the same rule to a parser and a third of the bytes. Add to it — or drop from
 * it — through `seo:robots-txt`.
 */
const AI_CRAWLERS = [
  "AI2Bot",
  "Amazonbot",
  "anthropic-ai",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "cohere-ai",
  "Diffbot",
  "DuckAssistBot",
  "FacebookBot",
  "Google-Extended",
  "GPTBot",
  "ImagesiftBot",
  "meta-externalagent",
  "MistralAI-User",
  "OAI-SearchBot",
  "omgili",
  "Perplexity-User",
  "PerplexityBot",
  "Timpibot",
  "YouBot",
];

const AI_CRAWLER_GROUP = `\n${AI_CRAWLERS.map((agent) => `User-agent: ${agent}\n`).join("")}Disallow: /\n`;

/** `GET /robots.txt` — an indexable site allows all crawling, one held out of the index allows none. */
export async function handleRobotsTxt(ctx: AppContext): Promise<Response> {
  const { indexable, blockAiCrawlers } = await loadSeoSettings(ctx);
  // A site held out of the index already disallows every agent, so the AI
  // group would say a second time what the first rule said.
  const ai = indexable && blockAiCrawlers ? AI_CRAWLER_GROUP : "";
  const body = await ctx.hooks.applyFilter(
    "seo:robots-txt",
    `User-agent: *\n${indexable ? "Disallow:" : "Disallow: /"}\n${ai}`,
  );
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
