import type { PluginRegistry } from "plumix";
import type { AppContext } from "plumix/plugin";
import {
  buildEntryPermalink,
  buildTermArchiveUrl,
  typeTag,
  withBasePath,
  xmlEscape,
} from "plumix";
import { and, entries, eq, sql, terms } from "plumix/db";

import type { SeoSettings } from "./settings.js";
import { entryImages } from "./entry-images.js";
import { SEO_META_KEYS } from "./overrides.js";
import { publicTargets } from "./scope.js";

// Well under the sitemaps.org 50k cap, and small enough to build + hold in
// Worker memory per request.
export const SITEMAP_PAGE_SIZE = 1000;

/** Where the index answers, before any base prefix. */
export const SITEMAP_INDEX_PATH = "/sitemap.xml";

// The entry-override arm of `indexable`, asked of the whole table at once —
// membership has to be a `WHERE`, or the count driving index pagination and
// the page it pages would disagree. Same meta key, so the head's directive and
// this cannot say different things about one page.
const NOINDEX_PATH = `$.${SEO_META_KEYS.noindex}`;

// `json_type`, not `json_extract`: extraction collapses JSON `true` and JSON
// `1` to the same integer, so a bag holding `1` would drop out of the sitemap
// while the reader — which is `=== true` — left its page saying `index`. The
// type is exactly what the reader tests, NULL arm included, so a bag that
// never answered and one holding anything else both stay listed.
const entryIsIndexable = sql`json_type(${entries.meta}, ${NOINDEX_PATH}) is not 'true'`;
const termIsIndexable = sql`json_type(${terms.meta}, ${NOINDEX_PATH}) is not 'true'`;

// Google's sitemap image extension — the one crawlers read image entries from.
const IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";

export interface SitemapUrl {
  readonly loc: string;
  readonly lastmod?: string;
  /**
   * Pictures this page shows, as absolute URLs. Listed so image search can
   * find them without crawling the page for `<img>` tags.
   */
  readonly images?: readonly string[];
}

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Adjust a sub-sitemap's URL set before it's serialized — add, drop, or
     * re-`lastmod` entries. Receives the scope (entry-type, taxonomy, or custom
     * archive name), the 1-based `page`, and the request `ctx` so a subscriber
     * can query the DB to inject rows, not just reshape statically-known URLs.
     */
    "seo:sitemap:urls": (
      urls: readonly SitemapUrl[],
      scope: string,
      page: number,
      ctx: AppContext,
    ) => readonly SitemapUrl[] | Promise<readonly SitemapUrl[]>;
  }
}

// The declaration plus the stylesheet a browser renders the document through.
// A crawler ignores the instruction and parses the same XML. The href goes in
// unescaped — a processing instruction's content is not entity-parsed, so an
// escape would be emitted literally — and it is a path this deployment's own
// config produced, not anything a request carries.
function prologue(stylesheet: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?xml-stylesheet type="text/xsl" href="${stylesheet}"?>`
  );
}

export function renderSitemapIndex(
  locs: readonly string[],
  stylesheet: string,
): string {
  const body = locs
    .map((loc) => `<sitemap><loc>${xmlEscape(loc)}</loc></sitemap>`)
    .join("");
  return (
    prologue(stylesheet) +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
  );
}

export function renderSubSitemap(
  urls: readonly SitemapUrl[],
  stylesheet: string,
): string {
  const body = urls
    .map(({ loc, lastmod, images }) => {
      const mod = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "";
      const pictures = (images ?? [])
        .map(
          (url) =>
            `<image:image><image:loc>${xmlEscape(url)}</image:loc></image:image>`,
        )
        .join("");
      return `<url><loc>${xmlEscape(loc)}</loc>${mod}${pictures}</url>`;
    })
    .join("");
  // The image namespace is declared only when a page carries one, so a set
  // with no pictures serializes exactly as it did before images existed.
  const imageNs = urls.some((url) => (url.images?.length ?? 0) > 0)
    ? ` xmlns:image="${IMAGE_NS}"`
    : "";
  return (
    prologue(stylesheet) +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNs}>${body}</urlset>`
  );
}

/**
 * One sub-sitemap's URL space: an entry type, a taxonomy, or an archive a
 * plugin registered. `tags` is what the scope's cached pages are stored under,
 * so a publish retires that scope and leaves the rest of the set alone.
 */
export interface SitemapScope {
  readonly name: string;
  /**
   * Which registry the name came from. An entry type and a taxonomy may share
   * one, and they carry separate indexing defaults, so the scope has to say
   * which of the two it is rather than let the name answer.
   */
  readonly kind: "entryType" | "taxonomy" | "archive";
  readonly tags: readonly string[];
  readonly count: (ctx: AppContext) => Promise<number> | number;
  readonly urls: (
    ctx: AppContext,
    page: number,
  ) => Promise<readonly SitemapUrl[]> | readonly SitemapUrl[];
}

/**
 * Where a sub-sitemap answers. The registered route path is root-relative —
 * the dispatcher strips any base prefix before matching — so the prefix is
 * re-added only on the `<loc>` the index publishes.
 */
function subSitemapPath(ctx: AppContext, scope: string, page: number): string {
  return withBasePath(`/sitemap-${scope}-${String(page)}.xml`, ctx.basePath);
}

/** The absolute index URL, for a caller that publishes it — `robots.txt`, `llms.txt`. */
export function sitemapIndexUrl(ctx: AppContext): string {
  return `${ctx.origin}${withBasePath(SITEMAP_INDEX_PATH, ctx.basePath)}`;
}

function offsetFor(page: number): number {
  return (page - 1) * SITEMAP_PAGE_SIZE;
}

function publishedEntriesOf(type: string) {
  return and(
    eq(entries.type, type),
    eq(entries.status, "published"),
    entryIsIndexable,
  );
}

function listedTermsOf(taxonomy: string) {
  return and(eq(terms.taxonomy, taxonomy), termIsIndexable);
}

async function entryCount(ctx: AppContext, type: string): Promise<number> {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(entries)
    .where(publishedEntriesOf(type));
  return row?.n ?? 0;
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
      meta: entries.meta,
    })
    .from(entries)
    .where(publishedEntriesOf(type))
    .orderBy(entries.id)
    .limit(SITEMAP_PAGE_SIZE)
    .offset(offsetFor(page));

  const images = await entryImages(
    ctx,
    type,
    rows.map((row) => row.meta),
  );
  const urls: SitemapUrl[] = [];
  for (const [index, row] of rows.entries()) {
    const path = await buildEntryPermalink(ctx, row);
    if (path === null) continue;
    urls.push({
      loc: `${ctx.origin}${path}`,
      lastmod: row.updatedAt.toISOString(),
      images: images[index] ?? [],
    });
  }
  return urls;
}

async function termCount(ctx: AppContext, taxonomy: string): Promise<number> {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(terms)
    .where(listedTermsOf(taxonomy));
  return row?.n ?? 0;
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
    .where(listedTermsOf(taxonomy))
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
 * Every scope the sitemap index enumerates, in the precedence core resolved a
 * scope name by: entry type, then taxonomy, then registered archive. A name
 * claimed twice keeps the first claim — two routes for one path would fail the
 * boot naming this plugin as its own rival.
 */
export function sitemapScopes(
  plugins: PluginRegistry,
): readonly SitemapScope[] {
  const scopes = new Map<string, SitemapScope>();
  const claim = (scope: SitemapScope): void => {
    if (!scopes.has(scope.name)) scopes.set(scope.name, scope);
  };

  for (const type of publicTargets(plugins.entryTypes)) {
    claim({
      name: type.name,
      kind: "entryType",
      tags: [typeTag(type.name)],
      count: (ctx) => entryCount(ctx, type.name),
      urls: (ctx, page) => entryUrls(ctx, type.name, page),
    });
  }
  for (const taxonomy of publicTargets(plugins.termTaxonomies)) {
    claim({
      name: taxonomy.name,
      kind: "taxonomy",
      // A term archive is stored under the `t:<type>` tags of its taxonomy's
      // entry types, and a term change purges exactly those — so the list of
      // those archives rides the same signal.
      tags: (taxonomy.entryTypes ?? []).map(typeTag),
      count: (ctx) => termCount(ctx, taxonomy.name),
      urls: (ctx, page) => termUrls(ctx, taxonomy.name, page),
    });
  }
  for (const archive of plugins.archiveTypes.values()) {
    const sitemap = archive.sitemap;
    if (!sitemap) continue;
    claim({
      name: archive.name,
      kind: "archive",
      tags: sitemap.tags ?? [],
      count: sitemap.count,
      urls: sitemap.urls,
    });
  }
  return [...scopes.values()];
}

/**
 * A scope's URLs for one page, passed through the `seo:sitemap:urls` filter —
 * which runs even on an empty page, so a subscriber can inject rows into a
 * scope that has none of its own.
 */
export async function collectSitemapUrls(
  ctx: AppContext,
  scope: SitemapScope,
  page: number,
): Promise<readonly SitemapUrl[]> {
  const urls = await scope.urls(ctx, page);
  return ctx.hooks.applyFilter("seo:sitemap:urls", urls, scope.name, page, ctx);
}

/** The sub-sitemap `<loc>`s the index lists, paged by each scope's own count. */
export async function sitemapIndexLocs(
  ctx: AppContext,
  scopes: readonly SitemapScope[],
): Promise<string[]> {
  const locs: string[] = [];
  for (const scope of scopes) {
    const total = await scope.count(ctx);
    if (total <= 0) continue;
    const pages = Math.ceil(total / SITEMAP_PAGE_SIZE);
    for (let page = 1; page <= pages; page++) {
      locs.push(`${ctx.origin}${subSitemapPath(ctx, scope.name, page)}`);
    }
  }
  return locs;
}

/**
 * Whether this scope's URLs may be offered at all — the `site_private`,
 * `type_default` and `taxonomy_default` arms of `indexable`, asked of a whole
 * scope rather than of a page, so a type held out of the index is not still
 * advertised here.
 *
 * A registered archive answers to neither per-scope default: it is a plugin's
 * own URL space, and the plugin declaring its `sitemap` is what opts it in.
 */
export function scopeIsOffered(
  scope: SitemapScope,
  settings: SeoSettings,
): boolean {
  if (!settings.indexable) return false;
  switch (scope.kind) {
    case "entryType":
      return !settings.noindexTypes.has(scope.name);
    case "taxonomy":
      return !settings.noindexTaxonomies.has(scope.name);
    case "archive":
      return true;
  }
}
