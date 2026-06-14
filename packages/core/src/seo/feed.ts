import type { AppContext } from "../context/app.js";
import type { DocumentLink, DocumentManifest, TemplateData } from "../theme.js";
import { and, desc, eq, inArray } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { users } from "../db/schema/users.js";
import { buildEntryPermalink } from "../route/permalink.js";
import { loadSiteSettings, nonEmpty } from "./site-settings.js";
import { xmlEscape } from "./xml.js";

// Recent-items window. Generous enough for a reader's "what's new" without
// turning the feed into a full archive (that's the sitemap's job).
export const FEED_LIMIT = 20;

type FeedFormat = "rss2" | "atom";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Adjust a feed's item list before serialization — add, drop, or re-order.
     * Receives the scope: `null` for the site feed, or the entry-type name.
     */
    "seo:feed:items": (
      items: readonly FeedItem[],
      scope: string | null,
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

/** The path of a feed scope's RSS2 feed (`null` = the site feed). */
export function feedBasePath(scope: string | null): string {
  return scope === null ? "/feed" : `/${scope}/feed`;
}

/** Whether a scope names a registered, public entry type. */
export function isPublicEntryType(ctx: AppContext, scope: string): boolean {
  const type = ctx.plugins.entryTypes.get(scope);
  return type !== undefined && type.isPublic !== false;
}

function publicEntryTypeNames(ctx: AppContext): string[] {
  return [...ctx.plugins.entryTypes.values()]
    .filter((type) => type.isPublic !== false)
    .map((type) => type.name);
}

/**
 * Recent published entries for a feed scope (`null` = every public entry type,
 * else a single type), newest first, run through `seo:feed:items`. Returns null
 * for an unknown / non-public type so the route can 404.
 */
export async function collectFeedItems(
  ctx: AppContext,
  scope: string | null,
): Promise<readonly FeedItem[] | null> {
  let typeNames: string[];
  if (scope === null) {
    typeNames = publicEntryTypeNames(ctx);
  } else {
    if (!isPublicEntryType(ctx, scope)) return null;
    typeNames = [scope];
  }

  const rows =
    typeNames.length === 0
      ? []
      : await ctx.db
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
          .where(
            and(
              inArray(entries.type, typeNames),
              eq(entries.status, "published"),
            ),
          )
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
  scope: string | null,
  format: FeedFormat,
): Promise<Response> {
  const site = await loadSiteSettings(ctx);
  // A private site is held out of syndication. (The sitemap returns an empty
  // 200 instead — there's no "valid but empty because private" feed idiom, so
  // 404 is the honest answer here.)
  if (site.public === false) return new Response(null, { status: 404 });

  const items = await collectFeedItems(ctx, scope);
  if (items === null) return new Response(null, { status: 404 });

  const base = feedBasePath(scope);
  const channel: FeedChannel = {
    title: nonEmpty(site.title) ?? ctx.origin,
    link: ctx.origin,
    feedUrl: `${ctx.origin}${base}${format === "atom" ? "/atom" : ""}`,
    description: nonEmpty(site.tagline) ?? "",
    updated: items[0]?.updated ?? new Date().toISOString(),
  };
  const body =
    format === "atom" ? renderAtom(channel, items) : renderRss2(channel, items);
  return new Response(body, {
    headers: { "content-type": CONTENT_TYPE[format] },
  });
}

// The feed scope a page should advertise: the entry-type for a type archive,
// `null` (the site feed) for a single entry / front page / taxonomy, or `false`
// for pages with no feed (search, error). A single entry advertises the site
// feed, not its type feed — a reader subscribing from a post wants "everything
// new", which is the convention (WordPress et al.).
function feedScope(data: TemplateData): string | null | false {
  if ("contentType" in data) return data.contentType;
  if ("query" in data) return false;
  if ("request" in data) return false;
  return null;
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
  const scope = feedScope(data);
  if (scope === false) return manifest;
  if (scope !== null && !isPublicEntryType(ctx, scope)) return manifest;

  const base = feedBasePath(scope);
  const existing = manifest.link;
  const additions: DocumentLink[] = [];
  const add = (type: string, href: string): void => {
    if (!hasAlternate(existing, type)) {
      additions.push({ rel: "alternate", type, href });
    }
  };
  add("application/rss+xml", `${ctx.origin}${base}`);
  add("application/atom+xml", `${ctx.origin}${base}/atom`);

  if (additions.length === 0) return manifest;
  return { ...manifest, link: [...(existing ?? []), ...additions] };
}
