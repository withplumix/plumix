import type { AppContext } from "plumix/plugin";

import { seoFilters } from "./events.js";
import { loadRobotsBody, loadSeoSettings } from "./settings.js";
import { sitemapIndexUrl } from "./sitemap.js";

/**
 * Training and assistant crawlers only; ordinary search indexers are blocked by
 * turning indexing off.
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

/** What a site that has written nothing serves: everything crawlable. */
const ALLOW_ALL = "User-agent: *\nDisallow:\n";
const DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

/**
 * Case-insensitive and anchored to a line, so a `Sitemap:` inside a comment or
 * a path does not read as a declaration.
 */
const SITEMAP_LINE = /^\s*sitemap\s*:/im;

/** What the settings screen answers about the file. */
interface RobotsInputs {
  readonly indexable: boolean;
  readonly blockAiCrawlers: boolean;
  readonly authored: string | null;
  readonly sitemap: string;
}

/**
 * The sitemap line is appended unless the author's rules declare one, so an
 * edit can't drop it by omission.
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
  const body = await ctx.filters.apply(
    seoFilters.robotsTxt,
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
