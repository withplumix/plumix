import type { AppContext } from "plumix";
import type { SQL } from "plumix/db";
import { buildEntryPermalink, dateRange, findTermByPath } from "plumix";
import {
  and,
  desc,
  entries,
  entryTerm,
  eq,
  gte,
  inArray,
  lt,
  users,
} from "plumix/db";

import type { FeedScope } from "./scope.js";
import type { FeedItem } from "./serialize.js";
import { isPublicEntryType, publicEntryTypeNames } from "./scope.js";

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

// SQL row filter for a scope; `null` means the scope can't yield a feed
// (unknown type or term, or no public types) so the caller 404s.
async function feedFilter(
  ctx: AppContext,
  scope: FeedScope,
): Promise<SQL | undefined | null> {
  const published = eq(entries.status, "published");
  if (scope.kind === "type") {
    if (!isPublicEntryType(ctx.plugins, scope.type)) return null;
    return and(eq(entries.type, scope.type), published);
  }

  if (scope.kind === "custom") {
    // A plugin archive's feed is entirely plugin-defined; its filter returns the
    // row predicate (or null → 404). Missing archive/feed → 404.
    const archive = ctx.plugins.archiveTypes.get(scope.name);
    if (!archive?.feed) return null;
    return archive.feed.filter(ctx, scope.params);
  }

  const typeNames = publicEntryTypeNames(ctx.plugins);
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

  // term: entries attached to the term — resolved by its full slug path, so a
  // nested term (`/base/parent/child/feed`) works, not just a top-level one —
  // and still of a public type. Unknown path → 404.
  const term = await findTermByPath(ctx, scope.taxonomy, scope.path);
  if (!term || typeNames.length === 0) return null;
  const attached = ctx.db
    .select({ id: entryTerm.entryId })
    .from(entryTerm)
    .where(eq(entryTerm.termId, term.id));
  return and(publicTypes, published, inArray(entries.id, attached));
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
