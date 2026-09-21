import type { AppContext, PluginRegistry } from "plumix/plugin";
import { typeTag } from "plumix/db";
import { loadSiteSettings, tagCdnEntry } from "plumix/plugin";
import { nonEmpty, withBasePath } from "plumix/support";

import type { FeedScope } from "./scope.js";
import type { FeedChannel, FeedFormat } from "./serialize.js";
import { collectFeedItems } from "./items.js";
import { publicEntryTypeNames } from "./scope.js";
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

// The `t:<type>` tags of the types a scope's query can read, which is what an
// entry mutation purges. The feed guard holds every scope, a plugin archive's
// included, to the public types.
function typeTags(plugins: PluginRegistry, scope: FeedScope): string[] {
  if (scope.kind === "type") return [typeTag(scope.type)];
  return publicEntryTypeNames(plugins).map(typeTag);
}

export async function handleFeed(
  ctx: AppContext,
  scope: FeedScope,
  format: FeedFormat,
  cacheable: boolean,
): Promise<Response> {
  tagCdnEntry(ctx, [FEED_TAG, ...typeTags(ctx.plugins, scope)]);
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
  const headers = new Headers({ "content-type": CONTENT_TYPE[format] });
  // A feed kept out of the CDN is out of reach of every purge, so it declares
  // no shared freshness for a cache in front of the origin to act on.
  if (cacheable) headers.set("cache-control", FEED_CACHE_CONTROL);
  return new Response(body, { headers });
}
