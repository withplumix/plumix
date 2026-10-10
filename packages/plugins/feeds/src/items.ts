import type { AppContext } from "plumix";
import type { SQL } from "plumix/db";
import type { ArchiveAtPath } from "plumix/plugin";
import { compileEntryQuery, desc, publicEntryRows, sql } from "plumix/db";
import { buildEntryPermalinks, resolveEntryList } from "plumix/plugin";
import { entries } from "plumix/schema";

import type { FeedScope } from "./scope.js";
import type { FeedItem } from "./serialize.js";
import { syndicatableEntryTypeNames } from "./scope.js";

/**
 * Recent-items window. Generous enough for a reader's "what's new" without
 * turning the feed into a full archive (that's the sitemap's job).
 */
export const FEED_LIMIT = 20;

/**
 * Feeds are consumed by aggregators, not rendered per request locale, so an
 * untitled entry's fallback title stays a fixed string rather than an i18n
 * message.
 */
const UNTITLED_FEED_TITLE = "Untitled";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Adjust a feed's item list before serialization — add, drop, or re-order.
     * Receives the {@link FeedScope} naming the archive the items were
     * collected for.
     */
    "feed:items": (
      items: readonly FeedItem[],
      scope: FeedScope,
    ) => readonly FeedItem[] | Promise<readonly FeedItem[]>;
  }
}

/**
 * `null` means 404. The public-entries rule is ANDed on again so a query built
 * from scratch can't syndicate a draft; access-policied types are dropped.
 */
async function feedWhere(
  ctx: AppContext,
  target: ArchiveAtPath,
): Promise<SQL | null> {
  const guard = publicEntryRows(ctx.plugins);
  if (guard === null) return null;
  const syndicatable = syndicatableEntryTypeNames(ctx.plugins);
  // An empty narrowing compiles to `false` and would serve an empty feed rather
  // than a 404.
  if (syndicatable.length === 0) return null;
  const narrowed = await compileEntryQuery(
    ctx,
    target.entries.ofTypes(...syndicatable),
  );
  if (narrowed === null) return null;
  return sql`${guard} and ${narrowed}`;
}

/**
 * Newest first whatever order the archive declared. Returns null when the
 * archive's query names something no entry answers to, so the route can 404.
 */
export async function collectFeedItems(
  ctx: AppContext,
  target: ArchiveAtPath,
): Promise<readonly FeedItem[] | null> {
  const where = await feedWhere(ctx, target);
  if (where === null) return null;

  const rows = await ctx.db
    .select()
    .from(entries)
    .where(where)
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(FEED_LIMIT);

  // Resolved so titles get the page's shortcode expansion; links come from the
  // chain walk because the resolved `url` is null for a nested entry.
  const [resolved, paths] = await Promise.all([
    resolveEntryList(ctx, rows),
    buildEntryPermalinks(ctx, rows),
  ]);
  const items: FeedItem[] = [];
  for (const [index, row] of resolved.entries()) {
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
      author: row.author.name ?? undefined,
    });
  }
  const scope: FeedScope = { archive: target.archive, params: target.params };
  return ctx.hooks.applyFilter("feed:items", items, scope);
}
