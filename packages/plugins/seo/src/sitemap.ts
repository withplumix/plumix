import type { PluginRegistry } from "plumix";
import type { AppContext } from "plumix/plugin";
import { and, eq, publicEntryRows, sql, typeTag } from "plumix/db";
import { buildEntryPermalinks, buildTermArchiveUrls } from "plumix/plugin";
import { entries, terms } from "plumix/schema";
import { withBasePath, xmlEscape } from "plumix/support";

import type { ContributedSitemap, SitemapSource } from "./contributed.js";
import type { SeoSettings } from "./settings.js";
import { entryImages } from "./entry-images.js";
import { SeoError } from "./errors.js";
import { SEO_META_KEYS } from "./overrides.js";
import { isCrawlableType, publicTargets } from "./scope.js";

/**
 * Well under the sitemaps.org 50k cap, and small enough to build + hold in
 * Worker memory per request.
 */
export const SITEMAP_PAGE_SIZE = 1000;

/** Where the index answers, before any base prefix. */
export const SITEMAP_INDEX_PATH = "/sitemap.xml";

/** A `WHERE`, so the count driving index pagination and the page agree. */
const NOINDEX_PATH = `$.${SEO_META_KEYS.noindex}`;

/**
 * `json_type`, not `json_extract`, which collapses `true` and `1`; this
 * matches the reader's `=== true`, NULL included.
 */
const entryIsIndexable = sql`json_type(${entries.meta}, ${NOINDEX_PATH}) is not 'true'`;
const termIsIndexable = sql`json_type(${terms.meta}, ${NOINDEX_PATH}) is not 'true'`;

/**
 * Google's sitemap image extension — the one crawlers read image entries from.
 */
const IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";

/** How often a page is likely to change, in the sitemaps.org vocabulary. */
export type SitemapChangeFrequency =
  "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface SitemapUrl {
  readonly loc: string;
  readonly lastmod?: string;
  /** Written as `<changefreq>` only when set. */
  readonly changefreq?: SitemapChangeFrequency;
  /**
   * This URL's priority relative to the site's other URLs, 0.0–1.0 per
   * sitemaps.org. Written as `<priority>` only when set, and not clamped:
   * the range is the contract.
   */
  readonly priority?: number;
  /**
   * Pictures this page shows, as absolute URLs. Listed so image search can
   * find them without crawling the page for `<img>` tags.
   */
  readonly images?: readonly string[];
}

declare module "plumix" {
  interface FilterRegistry {
    /** Runs even on an empty page, so a subscriber can inject rows. */
    "seo:sitemap:urls": (
      urls: readonly SitemapUrl[],
      scope: SitemapScopeRef,
      page: number,
      ctx: AppContext,
    ) => readonly SitemapUrl[] | Promise<readonly SitemapUrl[]>;
  }
}

/**
 * The href goes in unescaped: a processing instruction isn't entity-parsed, and
 * the path comes from config, not the request.
 */
function prologue(stylesheet: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?xml-stylesheet type="text/xsl" href="${stylesheet}"?>`
  );
}

/**
 * One `<sitemap>` the index lists: a sub-sitemap page and when it last changed.
 */
export interface SitemapIndexEntry {
  readonly loc: string;
  /** Written as `<lastmod>` only when set. */
  readonly lastmod?: string;
}

export function renderSitemapIndex(
  sitemaps: readonly SitemapIndexEntry[],
  stylesheet: string,
): string {
  const body = sitemaps
    .map(({ loc, lastmod }) => {
      const mod = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "";
      return `<sitemap><loc>${xmlEscape(loc)}</loc>${mod}</sitemap>`;
    })
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
    .map(({ loc, lastmod, changefreq, priority, images }) => {
      const mod = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "";
      const freq =
        changefreq === undefined
          ? ""
          : `<changefreq>${xmlEscape(changefreq)}</changefreq>`;
      // `0` is a priority, so presence is the test rather than truthiness.
      const rank =
        priority === undefined
          ? ""
          : `<priority>${xmlEscape(String(priority))}</priority>`;
      const pictures = (images ?? [])
        .map(
          (url) =>
            `<image:image><image:loc>${xmlEscape(url)}</image:loc></image:image>`,
        )
        .join("");
      // The sitemaps.org XSD sequence, with the image extension after it.
      return `<url><loc>${xmlEscape(loc)}</loc>${mod}${freq}${rank}${pictures}</url>`;
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

/** An entry type and a taxonomy sharing a name are still two scopes. */
export type SitemapScopeRef =
  | { readonly kind: "entries"; readonly name: string }
  | { readonly kind: "terms"; readonly name: string }
  | { readonly kind: "contributed"; readonly name: string };

/** The `changefreq` and `priority` a scope's URLs default to. */
export interface SitemapScopePolicy {
  readonly changefreq?: SitemapChangeFrequency;
  /** 0.0–1.0, as on {@link SitemapUrl.priority}. */
  readonly priority?: number;
}

type ScopePolicies = Readonly<Record<string, false | SitemapScopePolicy>>;

/**
 * A contributed scope sits under its own name. `false` leaves a scope out of
 * the sitemap.
 */
export interface SeoSitemapsOptions {
  readonly entries?: ScopePolicies;
  readonly terms?: ScopePolicies;
  readonly [contributed: string]:
    false | SitemapScopePolicy | ScopePolicies | undefined;
}

/** `tags` lets a publish retire this scope and leave the rest alone. */
export interface SitemapScope {
  readonly ref: SitemapScopeRef;
  /**
   * The `changefreq` and `priority` the site's `sitemaps` option set for this
   * scope.
   */
  readonly policy: SitemapScopePolicy;
  /** Whether the site's `sitemaps` option set this scope to `false`. */
  readonly dropped: boolean;
  readonly tags: readonly string[];
  /**
   * One element per page the index lists, each with the newest `lastmod`
   * among that page's URLs where the scope knows it. Empty for a scope with
   * nothing to list.
   */
  readonly pages: (ctx: AppContext) => Promise<readonly SitemapIndexPage[]>;
  readonly urls: (
    ctx: AppContext,
    page: number,
  ) => Promise<readonly SitemapUrl[]> | readonly SitemapUrl[];
}

interface SitemapIndexPage {
  readonly lastmod?: string;
}

/**
 * The file-name stem a scope's sub-sitemaps answer under:
 * `/sitemap-<stem>-<page>.xml`. A contributed scope keeps its bare name,
 * which is why `entries` and `terms` are reserved to seo's own.
 */
export function sitemapScopeStem(ref: SitemapScopeRef): string {
  switch (ref.kind) {
    case "entries":
      return `entries-${ref.name}`;
    case "terms":
      return `terms-${ref.name}`;
    case "contributed":
      return ref.name;
  }
}

/**
 * Root-relative: the dispatcher strips the base prefix, so only the published
 * `<loc>` re-adds it.
 */
function subSitemapPath(
  ctx: AppContext,
  ref: SitemapScopeRef,
  page: number,
): string {
  return withBasePath(
    `/sitemap-${sitemapScopeStem(ref)}-${String(page)}.xml`,
    ctx.config.basePath,
  );
}

/**
 * The absolute index URL, for a caller that publishes it — `robots.txt`,
 * `llms.txt`.
 */
export function sitemapIndexUrl(ctx: AppContext): string {
  return `${ctx.origin}${withBasePath(SITEMAP_INDEX_PATH, ctx.config.basePath)}`;
}

function undatedPages(total: number): SitemapIndexPage[] {
  return Array.from(
    { length: Math.ceil(Math.max(total, 0) / SITEMAP_PAGE_SIZE) },
    () => ({}),
  );
}

async function contributedPages(
  ctx: AppContext,
  source: SitemapSource,
): Promise<SitemapIndexPage[]> {
  const pages = undatedPages(await source.count(ctx));
  const { lastmod } = source;
  if (lastmod === undefined) return pages;
  return Promise.all(
    pages.map(async (_, index) => {
      const newest = await lastmod(ctx, index + 1);
      return newest === undefined ? {} : { lastmod: newest };
    }),
  );
}

function offsetFor(page: number): number {
  return (page - 1) * SITEMAP_PAGE_SIZE;
}

/** `null` where the site has no public type, so there is nothing to list. */
function publishedEntriesOf(ctx: AppContext, type: string) {
  const listed = publicEntryRows(ctx.plugins);
  if (listed === null) return null;
  return and(listed, eq(entries.type, type), entryIsIndexable);
}

function listedTermsOf(taxonomy: string) {
  return and(eq(terms.taxonomy, taxonomy), termIsIndexable);
}

/** One query for the whole scope; a query per page would grow with the site. */
async function entryPages(
  ctx: AppContext,
  type: string,
): Promise<SitemapIndexPage[]> {
  const where = publishedEntriesOf(ctx, type);
  if (where === null) return [];
  const ranked = ctx.db
    .select({
      updatedAt: entries.updatedAt,
      position: sql<number>`row_number() over (order by ${entries.id}) - 1`.as(
        "position",
      ),
    })
    .from(entries)
    .where(where)
    .as("ranked");
  // Cast, or a bound page size divides as a real and every row is a page.
  const page = sql<number>`${ranked.position} / cast(${SITEMAP_PAGE_SIZE} as integer)`;
  const rows = await ctx.db
    .select({
      lastmod: sql<Date>`max(${ranked.updatedAt})`.mapWith(entries.updatedAt),
    })
    .from(ranked)
    .groupBy(page)
    .orderBy(page);
  return rows.map((row) => ({ lastmod: row.lastmod.toISOString() }));
}

async function entryUrls(
  ctx: AppContext,
  type: string,
  page: number,
): Promise<SitemapUrl[]> {
  const where = publishedEntriesOf(ctx, type);
  if (where === null) return [];
  const rows = await ctx.db
    .select({
      slug: entries.slug,
      type: entries.type,
      parentId: entries.parentId,
      updatedAt: entries.updatedAt,
      meta: entries.meta,
    })
    .from(entries)
    .where(where)
    .orderBy(entries.id)
    .limit(SITEMAP_PAGE_SIZE)
    .offset(offsetFor(page));

  const images = await entryImages(
    ctx,
    type,
    rows.map((row) => row.meta),
  );
  const paths = await buildEntryPermalinks(ctx, rows);
  const urls: SitemapUrl[] = [];
  for (const [index, row] of rows.entries()) {
    const path = paths[index];
    if (path === null || path === undefined) continue;
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

  const paths = await buildTermArchiveUrls(ctx, rows);
  return paths.flatMap((path) =>
    path === null ? [] : [{ loc: `${ctx.origin}${path}` }],
  );
}

function policyOf(
  sitemaps: SeoSitemapsOptions,
  ref: SitemapScopeRef,
): false | SitemapScopePolicy | undefined {
  switch (ref.kind) {
    case "entries":
      return sitemaps.entries?.[ref.name];
    case "terms":
      return sitemaps.terms?.[ref.name];
    case "contributed":
      // A contributed name is never `entries` or `terms`, the two keys
      // holding a map of scopes, so its key holds one scope's policy.
      return sitemaps[ref.name];
  }
}

export function sitemapScopes(
  plugins: PluginRegistry,
  sitemaps: SeoSitemapsOptions,
  contributed: readonly ContributedSitemap[],
): readonly SitemapScope[] {
  const scopes: SitemapScope[] = [];
  const add = (scope: Omit<SitemapScope, "policy" | "dropped">): void => {
    const policy = policyOf(sitemaps, scope.ref) ?? {};
    scopes.push({
      ...scope,
      policy: policy === false ? {} : policy,
      dropped: policy === false,
    });
  };
  for (const type of publicTargets(plugins.entryTypes)) {
    if (!isCrawlableType(type)) continue;
    add({
      ref: { kind: "entries", name: type.name },
      tags: [typeTag(type.name)],
      pages: (ctx) => entryPages(ctx, type.name),
      urls: (ctx, page) => entryUrls(ctx, type.name, page),
    });
  }
  for (const taxonomy of publicTargets(plugins.termTaxonomies)) {
    add({
      ref: { kind: "terms", name: taxonomy.name },
      // A term change purges its taxonomy's entry-type tags.
      tags: (taxonomy.entryTypes ?? []).map(typeTag),
      // A term stores no modification time, so its pages carry no lastmod.
      pages: async (ctx) => undatedPages(await termCount(ctx, taxonomy.name)),
      urls: (ctx, page) => termUrls(ctx, taxonomy.name, page),
    });
  }
  for (const { name, source } of contributed) {
    add({
      ref: { kind: "contributed", name },
      tags: source.tags ?? [],
      pages: (ctx) => contributedPages(ctx, source),
      urls: source.urls,
    });
  }
  return scopes;
}

/** @throws naming the first `sitemaps` key that matches no listed scope. */
export function assertSitemapPolicyNamesScopes(
  sitemaps: SeoSitemapsOptions,
  scopes: readonly SitemapScope[],
): void {
  const { entries = {}, terms = {}, ...contributed } = sitemaps;
  const groups = [
    { kind: "entries", prefix: "entries.", keys: Object.keys(entries) },
    { kind: "terms", prefix: "terms.", keys: Object.keys(terms) },
    { kind: "contributed", prefix: "", keys: Object.keys(contributed) },
  ] as const;
  for (const { kind, prefix, keys } of groups) {
    const names = new Set(
      scopes
        .filter((scope) => scope.ref.kind === kind)
        .map((scope) => scope.ref.name),
    );
    const unknown = keys.find((key) => !names.has(key));
    if (unknown === undefined) continue;
    throw SeoError.unknownSitemapPolicyKey({ key: `${prefix}${unknown}` });
  }
}

/**
 * A value the URL carries beats the site's default for its scope. A field
 * neither sets stays absent, so the serializer writes no element for it.
 */
function withPolicy(url: SitemapUrl, policy: SitemapScopePolicy): SitemapUrl {
  const changefreq = url.changefreq ?? policy.changefreq;
  const priority = url.priority ?? policy.priority;
  return {
    ...url,
    ...(changefreq === undefined ? {} : { changefreq }),
    ...(priority === undefined ? {} : { priority }),
  };
}

/** The `seo:sitemap:urls` filter has the last word on every value. */
export async function collectSitemapUrls(
  ctx: AppContext,
  scope: SitemapScope,
  page: number,
): Promise<readonly SitemapUrl[]> {
  const provided = await scope.urls(ctx, page);
  const urls = provided.map((url) => withPolicy(url, scope.policy));
  return ctx.hooks.applyFilter("seo:sitemap:urls", urls, scope.ref, page, ctx);
}

/** The sub-sitemaps the index lists, one per page of each scope. */
export async function sitemapIndexEntries(
  ctx: AppContext,
  scopes: readonly SitemapScope[],
): Promise<SitemapIndexEntry[]> {
  const listed: SitemapIndexEntry[] = [];
  for (const scope of scopes) {
    const pages = await scope.pages(ctx);
    for (const [index, { lastmod }] of pages.entries()) {
      listed.push({
        loc: `${ctx.origin}${subSitemapPath(ctx, scope.ref, index + 1)}`,
        ...(lastmod === undefined ? {} : { lastmod }),
      });
    }
  }
  return listed;
}

/**
 * A `sitemaps: false` policy affects only the sitemap, never robots. A
 * contributed scope can be dropped only by that policy.
 */
export function scopeIsOffered(
  scope: SitemapScope,
  settings: SeoSettings,
): boolean {
  if (!settings.indexable) return false;
  if (scope.dropped) return false;
  switch (scope.ref.kind) {
    case "entries":
      return !settings.noindexTypes.has(scope.ref.name);
    case "terms":
      return !settings.noindexTaxonomies.has(scope.ref.name);
    case "contributed":
      return true;
  }
}
