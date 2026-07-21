import type { SQL } from "drizzle-orm";

import type { AppContext } from "../context/app.js";
import type { RegisteredTermTaxonomy } from "../plugin/manifest.js";
import type { DocumentLink, DocumentManifest, TemplateData } from "../theme.js";
import { withBasePath } from "../base-path.js";
import { and, desc, eq, gte, inArray, lt } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";
import { dateRange } from "../route/date-range.js";
import {
  buildEntryPermalink,
  termTaxonomyBaseSlug,
} from "../route/permalink.js";
import { loadSiteSettings, nonEmpty } from "./site-settings.js";
import { xmlEscape } from "./xml.js";

// Recent-items window. Generous enough for a reader's "what's new" without
// turning the feed into a full archive (that's the sitemap's job).
export const FEED_LIMIT = 20;

type FeedFormat = "rss2" | "atom";

/**
 * What a feed covers: the whole site, one entry type, one taxonomy term, or one
 * author. `taxonomy`/`term` are the registered taxonomy name + term slug;
 * `slug` on the author scope is the user's slug.
 */
type FeedScope =
  | { readonly kind: "site" }
  | { readonly kind: "type"; readonly type: string }
  | { readonly kind: "term"; readonly taxonomy: string; readonly term: string }
  | { readonly kind: "author"; readonly slug: string }
  | {
      readonly kind: "date";
      readonly year: number;
      readonly month: number | null;
      readonly day: number | null;
    };

declare module "../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Adjust a feed's item list before serialization — add, drop, or re-order.
     * Receives the {@link FeedScope} the items were collected for.
     */
    "seo:feed:items": (
      items: readonly FeedItem[],
      scope: FeedScope,
    ) => readonly FeedItem[] | Promise<readonly FeedItem[]>;
  }
}

export interface FeedItem {
  readonly title: string;
  readonly link: string;
  /** Stable identifier (Atom `<id>`); typically the permalink. */
  readonly id: string;
  /** Last-modified timestamp, ISO-8601. */
  readonly updated: string;
  /** First-published timestamp, ISO-8601. Falls back to `updated`. */
  readonly published?: string;
  readonly summary?: string;
  readonly author?: string;
}

export interface FeedChannel {
  readonly title: string;
  /** The site home URL. */
  readonly link: string;
  /** This feed's own URL (`rel="self"`). */
  readonly feedUrl: string;
  readonly description: string;
  /** Feed-level last-modified timestamp, ISO-8601. */
  readonly updated: string;
}

// RSS2 timestamps are RFC-822; `toUTCString()` produces exactly that shape.
function rfc822(iso: string): string {
  return new Date(iso).toUTCString();
}

export function renderRss2(
  channel: FeedChannel,
  items: readonly FeedItem[],
): string {
  const body = items
    .map((item) => {
      const summary = item.summary
        ? `<description>${xmlEscape(item.summary)}</description>`
        : "";
      const creator = item.author
        ? `<dc:creator>${xmlEscape(item.author)}</dc:creator>`
        : "";
      return (
        `<item>` +
        `<title>${xmlEscape(item.title)}</title>` +
        `<link>${xmlEscape(item.link)}</link>` +
        `<guid isPermaLink="true">${xmlEscape(item.link)}</guid>` +
        `<pubDate>${rfc822(item.published ?? item.updated)}</pubDate>` +
        summary +
        creator +
        `</item>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<channel>` +
    `<title>${xmlEscape(channel.title)}</title>` +
    `<link>${xmlEscape(channel.link)}</link>` +
    `<description>${xmlEscape(channel.description)}</description>` +
    `<atom:link href="${xmlEscape(channel.feedUrl)}" rel="self" type="application/rss+xml"></atom:link>` +
    `<lastBuildDate>${rfc822(channel.updated)}</lastBuildDate>` +
    body +
    `</channel></rss>`
  );
}

export function renderAtom(
  channel: FeedChannel,
  items: readonly FeedItem[],
): string {
  const body = items
    .map((item) => {
      const published = item.published
        ? `<published>${xmlEscape(item.published)}</published>`
        : "";
      const summary = item.summary
        ? `<summary>${xmlEscape(item.summary)}</summary>`
        : "";
      const author = item.author
        ? `<author><name>${xmlEscape(item.author)}</name></author>`
        : "";
      return (
        `<entry>` +
        `<title>${xmlEscape(item.title)}</title>` +
        `<link href="${xmlEscape(item.link)}"></link>` +
        `<id>${xmlEscape(item.id)}</id>` +
        `<updated>${xmlEscape(item.updated)}</updated>` +
        published +
        summary +
        author +
        `</entry>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<feed xmlns="http://www.w3.org/2005/Atom">` +
    `<title>${xmlEscape(channel.title)}</title>` +
    `<link href="${xmlEscape(channel.link)}"></link>` +
    `<link href="${xmlEscape(channel.feedUrl)}" rel="self"></link>` +
    `<id>${xmlEscape(channel.feedUrl)}</id>` +
    `<updated>${xmlEscape(channel.updated)}</updated>` +
    body +
    `</feed>`
  );
}

/** Whether a scope names a registered, public entry type. */
export function isPublicEntryType(ctx: AppContext, type: string): boolean {
  const entryType = ctx.plugins.entryTypes.get(type);
  return entryType !== undefined && entryType.isPublic !== false;
}

/** The public taxonomy whose archive base slug matches `slug`, if any. */
export function publicTaxonomyByBaseSlug(
  ctx: AppContext,
  slug: string,
): RegisteredTermTaxonomy | undefined {
  for (const taxonomy of ctx.plugins.termTaxonomies.values()) {
    if (
      taxonomy.isPublic !== false &&
      termTaxonomyBaseSlug(taxonomy) === slug
    ) {
      return taxonomy;
    }
  }
  return undefined;
}

function publicEntryTypeNames(ctx: AppContext): string[] {
  return [...ctx.plugins.entryTypes.values()]
    .filter((type) => type.isPublic !== false)
    .map((type) => type.name);
}

// SQL row filter for a scope; `null` means the scope can't yield a feed
// (unknown type/term, nested term, or no public types) so the caller 404s.
async function feedFilter(
  ctx: AppContext,
  scope: FeedScope,
): Promise<SQL | undefined | null> {
  const published = eq(entries.status, "published");
  if (scope.kind === "type") {
    if (!isPublicEntryType(ctx, scope.type)) return null;
    return and(eq(entries.type, scope.type), published);
  }

  const typeNames = publicEntryTypeNames(ctx);
  const publicTypes = inArray(entries.type, typeNames);
  if (scope.kind === "site") {
    return typeNames.length === 0 ? null : and(publicTypes, published);
  }

  if (scope.kind === "author") {
    // The author's published, public-type entries. Unknown slug → 404.
    const [author] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.slug, scope.slug));
    if (!author || typeNames.length === 0) return null;
    return and(publicTypes, published, eq(entries.authorId, author.id));
  }

  if (scope.kind === "date") {
    // Published, public-type entries in the period. An impossible date (Feb 30)
    // → null → 404, matching the date-archive resolver.
    const range = dateRange(scope.year, scope.month, scope.day);
    if (range === null || typeNames.length === 0) return null;
    return and(
      publicTypes,
      published,
      gte(entries.publishedAt, range.start),
      lt(entries.publishedAt, range.end),
    );
  }

  // term: only entries attached to the term, and still of a public type. Only
  // top-level terms have the flat `/base/slug/feed` URL the route addresses —
  // nested terms have no feed route yet, so they 404.
  const [term] = await ctx.db
    .select({ id: terms.id, parentId: terms.parentId })
    .from(terms)
    .where(and(eq(terms.taxonomy, scope.taxonomy), eq(terms.slug, scope.term)));
  if (!term) return null;
  if (term.parentId !== null || typeNames.length === 0) return null;
  const attached = ctx.db
    .select({ id: entryTerm.entryId })
    .from(entryTerm)
    .where(eq(entryTerm.termId, term.id));
  return and(publicTypes, published, inArray(entries.id, attached));
}

/**
 * Recent published, public-type entries for a feed scope, newest first, run
 * through `seo:feed:items`. Returns null for an unknown scope (non-public type,
 * missing term) so the route can 404.
 */
export async function collectFeedItems(
  ctx: AppContext,
  scope: FeedScope,
): Promise<readonly FeedItem[] | null> {
  const where = await feedFilter(ctx, scope);
  if (where === null) return null;

  const rows = await ctx.db
    .select({
      title: entries.title,
      slug: entries.slug,
      type: entries.type,
      parentId: entries.parentId,
      excerpt: entries.excerpt,
      updatedAt: entries.updatedAt,
      publishedAt: entries.publishedAt,
      authorName: users.name,
    })
    .from(entries)
    .leftJoin(users, eq(entries.authorId, users.id))
    .where(where)
    .orderBy(desc(entries.publishedAt))
    .limit(FEED_LIMIT);

  const items: FeedItem[] = [];
  for (const row of rows) {
    const path = await buildEntryPermalink(ctx, row);
    if (path === null) continue;
    const link = `${ctx.origin}${path}`;
    items.push({
      title: row.title,
      link,
      id: link,
      updated: row.updatedAt.toISOString(),
      published: (row.publishedAt ?? row.updatedAt).toISOString(),
      summary: row.excerpt ?? undefined,
      author: row.authorName ?? undefined,
    });
  }
  return ctx.hooks.applyFilter("seo:feed:items", items, scope);
}

const CONTENT_TYPE: Record<FeedFormat, string> = {
  rss2: "application/rss+xml; charset=utf-8",
  atom: "application/atom+xml; charset=utf-8",
};

export async function handleFeed(
  ctx: AppContext,
  scope: FeedScope,
  format: FeedFormat,
): Promise<Response> {
  const site = await loadSiteSettings(ctx);
  // A private site is held out of syndication. (The sitemap returns an empty
  // 200 instead — there's no "valid but empty because private" feed idiom, so
  // 404 is the honest answer here.)
  if (site.public === false) return new Response(null, { status: 404 });

  const items = await collectFeedItems(ctx, scope);
  if (items === null) return new Response(null, { status: 404 });

  const channel: FeedChannel = {
    title: nonEmpty(site.title) ?? ctx.origin,
    link: `${ctx.origin}${withBasePath("/", ctx.basePath)}`,
    // The feed's self URL is this request's path. The dispatcher already
    // stripped the base prefix, so re-add it for the externally-visible URL.
    feedUrl: `${ctx.origin}${withBasePath(new URL(ctx.request.url).pathname, ctx.basePath)}`,
    description: nonEmpty(site.tagline) ?? "",
    updated: items[0]?.updated ?? new Date().toISOString(),
  };
  const body =
    format === "atom" ? renderAtom(channel, items) : renderRss2(channel, items);
  return new Response(body, {
    headers: { "content-type": CONTENT_TYPE[format] },
  });
}

// The feed base path a page should advertise, or `false` when it has none
// (search, error, or a non-public type/taxonomy). A single entry advertises the
// site feed, not its type feed — a reader subscribing from a post wants
// "everything new", which is the convention (WordPress et al.).
function discoveryFeedBase(
  data: TemplateData,
  ctx: AppContext,
): string | false {
  if ("contentType" in data) {
    return isPublicEntryType(ctx, data.contentType)
      ? `/${data.contentType}/feed`
      : false;
  }
  if ("taxonomy" in data) {
    const taxonomy = ctx.plugins.termTaxonomies.get(data.taxonomy);
    if (!taxonomy || taxonomy.isPublic === false) return false;
    // Only top-level terms have the flat URL the feed route can address.
    if (data.term.parentId !== null) return false;
    return `/${termTaxonomyBaseSlug(taxonomy)}/${data.term.slug}/feed`;
  }
  if ("author" in data) return `/authors/${data.author.slug}/feed`;
  if ("year" in data) {
    const parts = [String(data.year)];
    if (data.month !== null) parts.push(String(data.month).padStart(2, "0"));
    if (data.day !== null) parts.push(String(data.day).padStart(2, "0"));
    return `/${parts.join("/")}/feed`;
  }
  if ("query" in data) return false;
  if ("request" in data) return false;
  return "/feed";
}

function hasAlternate(
  links: readonly DocumentLink[] | undefined,
  type: string,
): boolean {
  return links?.some((l) => l.rel === "alternate" && l.type === type) ?? false;
}

/**
 * Gap-filler: append `<link rel="alternate">` feed-discovery tags for the
 * page's scope, skipping any type already present so a template / plugin value
 * wins. A private site advertises nothing (it 404s its feeds).
 */
export function applyFeedDiscovery(
  manifest: DocumentManifest,
  data: TemplateData,
  ctx: AppContext,
  opts: { readonly siteIsPrivate: boolean },
): DocumentManifest {
  if (opts.siteIsPrivate) return manifest;
  const base = discoveryFeedBase(data, ctx);
  if (base === false) return manifest;

  const existing = manifest.link;
  const additions: DocumentLink[] = [];
  const add = (type: string, href: string): void => {
    if (!hasAlternate(existing, type)) {
      additions.push({ rel: "alternate", type, href });
    }
  };
  add(
    "application/rss+xml",
    `${ctx.origin}${withBasePath(base, ctx.basePath)}`,
  );
  add(
    "application/atom+xml",
    `${ctx.origin}${withBasePath(`${base}/atom`, ctx.basePath)}`,
  );

  if (additions.length === 0) return manifest;
  return { ...manifest, link: [...(existing ?? []), ...additions] };
}
