import type { AppContext, ArchiveAtPath, PluginRegistry } from "plumix/plugin";
import { typeTag } from "plumix/db";
import { loadSiteSettings, tagCdnEntry } from "plumix/plugin";
import { nonEmpty, withBasePath } from "plumix/support";

import type { FeedChannel, FeedFormat } from "./serialize.js";
import { collectFeedItems } from "./items.js";
import { feedAt } from "./routes.js";
import { syndicatableEntryTypeNames } from "./scope.js";
import { renderAtom, renderRss2 } from "./serialize.js";

const CONTENT_TYPE: Record<FeedFormat, string> = {
  rss2: "application/rss+xml; charset=utf-8",
  atom: "application/atom+xml; charset=utf-8",
};

// A reader polls on its own timer, so the window that matters is the shared
// one: an hour at the edge, cut short by the purge a publish fires, while a
// client is told to revalidate rather than sit on a stale copy.
const FEED_CACHE_CONTROL = "public, max-age=0, s-maxage=3600";

/**
 * Carried by every feed on top of its type tags. The channel's title and
 * description, and whether the site syndicates at all, come from the site
 * settings, so a save there has to retire every feed.
 */
export const FEED_TAG = "feeds:feed";

// The `t:<type>` tags of the types an archive's feed can read, which is what an
// entry mutation purges: its own type's for a type archive, and every type a
// feed may carry for the rest.
function typeTags(
  plugins: PluginRegistry,
  target: ArchiveAtPath | null,
): string[] {
  if (target?.archive.kind === "archive") {
    return [typeTag(target.archive.entryType)];
  }
  return syndicatableEntryTypeNames(plugins).map(typeTag);
}

export async function handleFeed(
  ctx: AppContext,
  format: FeedFormat,
  cacheable: boolean,
): Promise<Response> {
  // The dispatcher already stripped the base prefix, which is how core's
  // archive lookup reads a path too.
  const pathname = new URL(ctx.request.url).pathname;
  const target = feedAt(ctx, pathname);
  tagCdnEntry(ctx, [FEED_TAG, ...typeTags(ctx.plugins, target)]);
  const site = await loadSiteSettings(ctx);
  // A private site is held out of syndication. (The sitemap returns an empty
  // 200 instead — there's no "valid but empty because private" feed idiom, so
  // 404 is the honest answer here.)
  if (site.public === false) return new Response(null, { status: 404 });

  if (target === null) return new Response(null, { status: 404 });
  const items = await collectFeedItems(ctx, target);
  if (items === null) return new Response(null, { status: 404 });

  const channel: FeedChannel = {
    title: nonEmpty(site.title) ?? ctx.origin,
    link: `${ctx.origin}${withBasePath("/", ctx.basePath)}`,
    // The feed's self URL is this request's path, base prefix re-added for
    // the externally-visible URL.
    feedUrl: `${ctx.origin}${withBasePath(pathname, ctx.basePath)}`,
    description: nonEmpty(site.tagline) ?? "",
    updated: items[0]?.updated ?? new Date().toISOString(),
  };
  const body =
    format === "atom" ? renderAtom(channel, items) : renderRss2(channel, items);
  const headers = new Headers({ "content-type": CONTENT_TYPE[format] });
  // A feed kept out of the CDN is out of reach of every purge, so it declares
  // no shared freshness for a cache in front of the origin to act on.
  if (cacheable) headers.set("cache-control", FEED_CACHE_CONTROL);
  return new Response(body, { headers });
}
