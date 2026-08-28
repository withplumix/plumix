import type { AppContext } from "plumix/plugin";

import { loadRobotsBody, loadSeoSettings } from "./settings.js";
import { sitemapIndexUrl } from "./sitemap.js";

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

// What a site that has written nothing serves: everything crawlable.
const ALLOW_ALL = "User-agent: *\nDisallow:\n";
const DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

// Case-insensitive and anchored to a line, so a `Sitemap:` inside a comment or
// a path does not read as a declaration.
const SITEMAP_LINE = /^\s*sitemap\s*:/im;

// What the settings screen answers about the file.
interface RobotsInputs {
  readonly indexable: boolean;
  readonly blockAiCrawlers: boolean;
  /** Hand-written content replacing the generated rules, or null. */
  readonly authored: string | null;
  readonly sitemap: string;
}

/**
 * The body `/robots.txt` serves.
 *
 * A site held out of the index disallows everything, whatever else is set —
 * the site-wide answer is the one assertion nothing below overrides, and a
 * blanket disallow already covers every AI agent the group would name.
 *
 * Otherwise the author's own rules are served if they wrote any, and the two
 * site-wide answers are composed onto them: the AI-crawler group while that
 * toggle is on, and the sitemap line unless they declared one themselves, so
 * an edit cannot drop the reference by omission. It can still point it
 * somewhere else, or disallow the path: this keeps the line, not the crawl.
 */
function robotsTxt(inputs: RobotsInputs): string {
  if (!inputs.indexable) return DISALLOW_ALL;
  const rules = endsInNewline(inputs.authored ?? ALLOW_ALL);
  const ai = inputs.blockAiCrawlers ? AI_CRAWLER_GROUP : "";
  const sitemap = SITEMAP_LINE.test(rules)
    ? ""
    : `\nSitemap: ${inputs.sitemap}\n`;
  return `${rules}${ai}${sitemap}`;
}

function endsInNewline(body: string): string {
  return body.endsWith("\n") ? body : `${body}\n`;
}

/** `GET /robots.txt`. */
export async function handleRobotsTxt(ctx: AppContext): Promise<Response> {
  const [settings, authored] = await Promise.all([
    loadSeoSettings(ctx),
    loadRobotsBody(ctx),
  ]);
  const body = await ctx.hooks.applyFilter(
    "seo:robots-txt",
    robotsTxt({
      indexable: settings.indexable,
      blockAiCrawlers: settings.blockAiCrawlers,
      authored,
      sitemap: sitemapIndexUrl(ctx),
    }),
  );
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
