import type { AppContext } from "plumix";
import type { SQL } from "plumix/db";
import type { ArchiveAtPath } from "plumix/plugin";
import { compileEntryQuery, desc, eq, publicEntryRows, sql } from "plumix/db";
import { buildEntryPermalinks } from "plumix/plugin";
import { entries, users } from "plumix/schema";

import type { FeedScope } from "./scope.js";
import type { FeedItem } from "./serialize.js";
import { syndicatableEntryTypeNames } from "./scope.js";

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
     * Receives the {@link FeedScope} naming the archive the items were
     * collected for.
     */
    "feed:items": (
      items: readonly FeedItem[],
      scope: FeedScope,
    ) => readonly FeedItem[] | Promise<readonly FeedItem[]>;
  }
}

// The WHERE the archive's query selects by, or `null` → 404. The public-entries
// rule is ANDed on again whether or not the query carries it, as core's listing
// reader does, so an archive whose `entries` built a query from scratch rather
// than narrowing the one it was handed still cannot syndicate a draft. The
// types no feed may carry are narrowed off here rather than there: core's rule
// leaves an access-policied type in, and a feed has no reader to check it for.
async function feedWhere(
  ctx: AppContext,
  target: ArchiveAtPath,
): Promise<SQL | null> {
  const guard = publicEntryRows(ctx.plugins);
  if (guard === null) return null;
  const narrowed = await compileEntryQuery(
    ctx,
    target.entries.ofTypes(...syndicatableEntryTypeNames(ctx.plugins)),
  );
  if (narrowed === null) return null;
  return sql`${guard} and ${narrowed}`;
}

/**
 * An archive's most recent entries, newest first whatever order the archive
 * declared — that is what a subscriber's reader assumes — run through
 * `feed:items`. Returns null where the archive's query names something no
 * entry answers to (a missing term or author, an impossible date) so the
 * route can 404.
 */
export async function collectFeedItems(
  ctx: AppContext,
  target: ArchiveAtPath,
): Promise<readonly FeedItem[] | null> {
  const where = await feedWhere(ctx, target);
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
    .orderBy(desc(entries.publishedAt), desc(entries.id))
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
  const scope: FeedScope = { archive: target.archive, params: target.params };
  return ctx.hooks.applyFilter("feed:items", items, scope);
}
