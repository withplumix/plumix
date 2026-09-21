import type { AppContext } from "plumix";
import type { EntryQuery, SQL } from "plumix/db";
import { compileEntryQuery, desc, entryQuery, eq, sql } from "plumix/db";
import { buildEntryPermalinks } from "plumix/plugin";
import { entries, users } from "plumix/schema";

import type { FeedScope } from "./scope.js";
import type { FeedItem } from "./serialize.js";
import { isLaterPage, isSyndicatable, listingUnder } from "./routes.js";
import { feedGuard, isPublicEntryType } from "./scope.js";

// Recent-items window. Generous enough for a reader's "what's new" without
// turning the feed into a full archive (that's the sitemap's job).
export const FEED_LIMIT = 20;

// Feeds are consumed by aggregators, not rendered per request locale, so an
// untitled entry's fallback title stays a fixed string rather than an i18n
// message.
const UNTITLED_FEED_TITLE = "Untitled";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Adjust a feed's item list before serialization — add, drop, or re-order.
     * Receives the {@link FeedScope} the items were collected for.
     */
    "feed:items": (
      items: readonly FeedItem[],
      scope: FeedScope,
    ) => readonly FeedItem[] | Promise<readonly FeedItem[]>;
  }
}

// The query a scope narrows, or `null` where the scope can't yield a feed
// (unknown type or archive, a later page of a listing) so the caller 404s.
// Synchronous: a slug a scope names is resolved when the query is compiled,
// not here.
function feedQuery(
  ctx: AppContext,
  scope: FeedScope,
  seed: EntryQuery,
): EntryQuery | null {
  switch (scope.kind) {
    case "site":
      return seed;
    case "type":
      return isPublicEntryType(ctx.plugins, scope.type)
        ? seed.ofTypes(scope.type)
        : null;
    case "author":
      return seed.byAuthor(scope.slug);
    case "date":
      return seed.inDateRange(scope.year, scope.month, scope.day);
    case "term":
      return seed.inTerm(scope.taxonomy, scope.path);
    case "custom": {
      // A plugin archive's feed is entirely plugin-defined; its scope narrows
      // the seeded query (or answers null → 404).
      const archive = ctx.plugins.archiveTypes.get(scope.name);
      if (archive === undefined || !isSyndicatable(archive)) return null;
      const listing = listingUnder(new URL(ctx.request.url).pathname);
      if (isLaterPage(archive.routes, listing)) return null;
      return archive.feed.scope(seed, scope.params);
    }
  }
}

// The WHERE a feed scope selects by, or `null` → 404. Both halves arrive
// parenthesized, so joining them cannot regroup either.
async function feedWhere(
  ctx: AppContext,
  scope: FeedScope,
): Promise<SQL | null> {
  const guard = feedGuard(ctx.plugins);
  if (guard === null) return null;
  const query = feedQuery(ctx, scope, entryQuery().where(guard));
  if (query === null) return null;
  const narrowed = await compileEntryQuery(ctx, query);
  if (narrowed === null) return null;
  return sql`${guard} and ${narrowed}`;
}

/**
 * Recent published, public-type entries for a feed scope, newest first, run
 * through `feed:items`. Returns null for an unknown scope (non-public type,
 * missing term) so the route can 404.
 */
export async function collectFeedItems(
  ctx: AppContext,
  scope: FeedScope,
): Promise<readonly FeedItem[] | null> {
  const where = await feedWhere(ctx, scope);
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

  const paths = await buildEntryPermalinks(ctx, rows);
  const items: FeedItem[] = [];
  for (const [index, row] of rows.entries()) {
    const path = paths[index];
    if (path === null || path === undefined) continue;
    const link = `${ctx.origin}${path}`;
    items.push({
      // Atom requires a non-empty item title; an untitled entry falls back so
      // the feed stays valid rather than emitting `<title></title>`.
      title: row.title.trim() === "" ? UNTITLED_FEED_TITLE : row.title,
      link,
      id: link,
      updated: row.updatedAt.toISOString(),
      published: (row.publishedAt ?? row.updatedAt).toISOString(),
      summary: row.excerpt ?? undefined,
      author: row.authorName ?? undefined,
    });
  }
  return ctx.hooks.applyFilter("feed:items", items, scope);
}
