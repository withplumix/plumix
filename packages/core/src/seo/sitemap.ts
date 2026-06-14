import type { AppContext } from "../context/app.js";
import { and, eq, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { terms } from "../db/schema/terms.js";
import {
  buildEntryPermalink,
  buildTermArchiveUrl,
} from "../route/permalink.js";
import { loadSiteSettings } from "./site-settings.js";
import { cachedSubSitemap } from "./sitemap-cache.js";
import { xmlEscape } from "./xml.js";

// Well under the sitemaps.org 50k cap, and small enough to build + hold in
// Worker memory per request.
export const SITEMAP_PAGE_SIZE = 1000;

export interface SitemapUrl {
  readonly loc: string;
  readonly lastmod?: string;
}

declare module "../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Adjust a sub-sitemap's URL set before it's serialized — add, drop, or
     * re-`lastmod` entries. Receives the scope (entry-type or taxonomy name).
     */
    "seo:sitemap:urls": (
      urls: readonly SitemapUrl[],
      scope: string,
    ) => readonly SitemapUrl[] | Promise<readonly SitemapUrl[]>;
  }
}

export function renderSitemapIndex(locs: readonly string[]): string {
  const body = locs
    .map((loc) => `<sitemap><loc>${xmlEscape(loc)}</loc></sitemap>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
  );
}

export function renderSubSitemap(urls: readonly SitemapUrl[]): string {
  const body = urls
    .map(({ loc, lastmod }) => {
      const mod = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "";
      return `<url><loc>${xmlEscape(loc)}</loc>${mod}</url>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`
  );
}

function offsetFor(page: number): number {
  return (page - 1) * SITEMAP_PAGE_SIZE;
}

async function entryUrls(
  ctx: AppContext,
  type: string,
  page: number,
): Promise<SitemapUrl[]> {
  const rows = await ctx.db
    .select({
      slug: entries.slug,
      type: entries.type,
      parentId: entries.parentId,
      updatedAt: entries.updatedAt,
    })
    .from(entries)
    .where(and(eq(entries.type, type), eq(entries.status, "published")))
    .orderBy(entries.id)
    .limit(SITEMAP_PAGE_SIZE)
    .offset(offsetFor(page));

  const urls: SitemapUrl[] = [];
  for (const row of rows) {
    const path = await buildEntryPermalink(ctx, row);
    if (path === null) continue;
    urls.push({
      loc: `${ctx.origin}${path}`,
      lastmod: row.updatedAt.toISOString(),
    });
  }
  return urls;
}

async function termUrls(
  ctx: AppContext,
  taxonomy: string,
  page: number,
): Promise<SitemapUrl[]> {
  const rows = await ctx.db
    .select({
      slug: terms.slug,
      taxonomy: terms.taxonomy,
      parentId: terms.parentId,
    })
    .from(terms)
    .where(eq(terms.taxonomy, taxonomy))
    .orderBy(terms.id)
    .limit(SITEMAP_PAGE_SIZE)
    .offset(offsetFor(page));

  const urls: SitemapUrl[] = [];
  for (const row of rows) {
    const path = await buildTermArchiveUrl(ctx, row);
    if (path !== null) urls.push({ loc: `${ctx.origin}${path}` });
  }
  return urls;
}

/**
 * The published, public-type URLs for one sub-sitemap scope + page, passed
 * through the `seo:sitemap:urls` filter. Returns null for an unknown / non-public
 * scope, which the caller renders as an empty `<urlset>`.
 */
export async function collectSitemapUrls(
  ctx: AppContext,
  scope: string,
  page: number,
): Promise<readonly SitemapUrl[] | null> {
  const entryType = ctx.plugins.entryTypes.get(scope);
  let urls: SitemapUrl[] | null = null;
  if (entryType && entryType.isPublic !== false) {
    urls = await entryUrls(ctx, scope, page);
  } else {
    const taxonomy = ctx.plugins.termTaxonomies.get(scope);
    if (taxonomy && taxonomy.isPublic !== false) {
      urls = await termUrls(ctx, scope, page);
    }
  }
  if (urls === null) return null;
  return ctx.hooks.applyFilter("seo:sitemap:urls", urls, scope);
}

async function sitemapIndexLocs(ctx: AppContext): Promise<string[]> {
  const locs: string[] = [];
  const pushScope = (name: string, total: number): void => {
    const pages = Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
    for (let page = 1; total > 0 && page <= pages; page++) {
      locs.push(`${ctx.origin}/sitemap-${name}-${String(page)}.xml`);
    }
  };

  for (const type of ctx.plugins.entryTypes.values()) {
    if (type.isPublic === false) continue;
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(entries)
      .where(and(eq(entries.type, type.name), eq(entries.status, "published")));
    pushScope(type.name, Number(row?.n ?? 0));
  }
  for (const taxonomy of ctx.plugins.termTaxonomies.values()) {
    if (taxonomy.isPublic === false) continue;
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(terms)
      .where(eq(terms.taxonomy, taxonomy.name));
    pushScope(taxonomy.name, Number(row?.n ?? 0));
  }
  return locs;
}

function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

async function isPrivate(ctx: AppContext): Promise<boolean> {
  return (await loadSiteSettings(ctx)).public === false;
}

export async function handleSitemapIndex(ctx: AppContext): Promise<Response> {
  // A private site is held out of search: emit an empty index.
  const locs = (await isPrivate(ctx)) ? [] : await sitemapIndexLocs(ctx);
  return xmlResponse(renderSitemapIndex(locs));
}

export function handleSubSitemap(
  ctx: AppContext,
  scope: string,
  page: number,
): Promise<Response> {
  // The privacy gate and the URL scan both live inside the generator so a
  // cache hit touches D1 zero times. A `settings:group_changed` bump retires
  // the cache when the site flips private, keeping the gate honest.
  return cachedSubSitemap(ctx, scope, page, async () => {
    if (await isPrivate(ctx)) return xmlResponse(renderSubSitemap([]));
    const urls = await collectSitemapUrls(ctx, scope, page);
    return xmlResponse(renderSubSitemap(urls ?? []));
  });
}
