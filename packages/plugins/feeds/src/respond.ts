import type { AppContext } from "plumix";
import { loadSiteSettings, nonEmpty, withBasePath } from "plumix";

import type { FeedScope } from "./scope.js";
import type { FeedChannel, FeedFormat } from "./serialize.js";
import { collectFeedItems } from "./items.js";
import { renderAtom, renderRss2 } from "./serialize.js";

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
