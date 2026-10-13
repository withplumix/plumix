import type { AppContext } from "plumix/plugin";
import { anonymousContext } from "plumix/auth";
import { desc } from "plumix/db";
import { labelSourceText } from "plumix/i18n";
import {
  buildEntryPermalinks,
  loadSiteSettings,
  resolveEntryList,
} from "plumix/plugin";
import { entries } from "plumix/schema";

import type { SeoSettings } from "./settings.js";
import { publicTargets } from "./scope.js";
import { loadSeoSettings, nonEmpty } from "./settings.js";
import { listedEntriesOf, sitemapIndexUrl } from "./sitemap.js";

/** Where the file answers, before any base prefix. */
export const LLMS_PATH = "/llms.txt";

/**
 * The newest of each type: a map for a reader to start from, not an archive.
 * A site reshapes the file through `seo:llms-txt`.
 */
const LLMS_ENTRIES_PER_TYPE = 50;

/** A fixed string, as a feed's: the file is not rendered per locale. */
const UNTITLED = "Untitled";

/** Still served, so a crawler doesn't read a 404 as "nothing here yet". */
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

/** Escaped so a bracket in a title cannot close the link text early. */
function linkText(title: string): string {
  const text = title.trim() === "" ? UNTITLED : title;
  return text.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

/** Encoded so a parenthesis in a URL cannot close the link early. */
function linkTarget(url: string): string {
  return url.replaceAll("(", "%28").replaceAll(")", "%29");
}

/**
 * Its title, link and excerpt, never its body: the format has no place for
 * one, and a gated entry's body is not anonymous visitors' to read.
 */
function entryLine(title: string, url: string, excerpt: string | null): string {
  const notes = (excerpt ?? "").replace(/\s+/g, " ").trim();
  const link = `- [${linkText(title)}](${linkTarget(url)})`;
  return notes === "" ? `${link}\n` : `${link}: ${notes}\n`;
}

/** One `entries` query per type, whatever the site holds. */
async function typeSection(
  reader: AppContext,
  type: string,
  heading: string,
): Promise<string> {
  const where = await listedEntriesOf(reader, type);
  if (where === null) return "";
  const rows = await reader.db
    .select()
    .from(entries)
    .where(where)
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(LLMS_ENTRIES_PER_TYPE);
  const [resolved, paths] = await Promise.all([
    resolveEntryList(reader, rows),
    buildEntryPermalinks(reader, rows),
  ]);
  const lines = resolved.flatMap((row, index) => {
    const path = paths[index];
    if (path === null || path === undefined) return [];
    return [entryLine(row.title, `${reader.origin}${path}`, row.excerpt)];
  });
  return lines.length === 0 ? "" : `\n## ${heading}\n\n${lines.join("")}`;
}

/**
 * Listed as anonymous visitors may list them, whoever asks. The `sitemaps`
 * option is the sitemap's alone, so it does not narrow this.
 */
async function entrySections(
  ctx: AppContext,
  seo: SeoSettings,
): Promise<string> {
  const reader = anonymousContext(ctx);
  const types = publicTargets(ctx.plugins.entryTypes).filter(
    (type) => !seo.noindexTypes.has(type.name),
  );
  const sections = await Promise.all(
    types.map((type) =>
      typeSection(
        reader,
        type.name,
        labelSourceText(type.labels?.plural ?? type.label),
      ),
    ),
  );
  return sections.join("");
}

/**
 * A site held out of the index or blocking AI crawlers gets the heading and a
 * sentence, not the map.
 */
export async function llmsTxtBody(ctx: AppContext): Promise<string> {
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
  const offered = seo.indexable && !seo.blockAiCrawlers;
  const listed = offered ? await entrySections(ctx, seo) : "";
  const map = offered
    ? `\n## Sitemap\n\n- [XML sitemap](${sitemap}): every URL this site offers to search engines.\n`
    : `\n${WITHHELD}\n`;
  return ctx.hooks.applyFilter("seo:llms-txt", heading + intro + listed + map);
}
