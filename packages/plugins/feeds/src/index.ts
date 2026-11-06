import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin, loadSiteSettings, render } from "plumix/plugin";

import { applyFeedDiscovery } from "./discovery.js";
import { feed } from "./events.js";
import { handleFeed } from "./respond.js";
import { feedRoutes } from "./routes.js";
// A `declare module "plumix"` block reaches a consumer only if its module is in
// this package's declaration graph, so the augmenting module is imported
// explicitly.
import "./archive.js"; // ListingArchiveTypeOptions.feed

export type { ArchiveTypeFeed } from "./archive.js";
export type { FeedScope } from "./scope.js";
export type { FeedChannel, FeedFormat, FeedItem } from "./serialize.js";
export { FEED_LIMIT } from "./items.js";
export { feed } from "./events.js";

/**
 * RSS 2.0 and Atom for every archive; a feed is its archive's own entry query,
 * newest first.
 */
export function feeds(): PluginDescriptor {
  return definePlugin("feeds", {
    filters: [feed.items],
    setup: (ctx) => {
      ctx.filters.add(render.document, async (manifest, { data }, appCtx) => {
        const site = await loadSiteSettings(appCtx);
        return applyFeedDiscovery(
          manifest,
          data,
          appCtx,
          site.public === false,
        );
      });
    },
    afterSetup: (ctx) => {
      for (const route of feedRoutes(ctx.plugins)) {
        ctx.registerPublicRoute({
          path: route.path,
          cacheable: route.cacheable,
          handler: (_request, appCtx) => handleFeed(appCtx, "rss2", route),
        });
        ctx.registerPublicRoute({
          path: `${route.path}/atom`,
          cacheable: route.cacheable,
          handler: (_request, appCtx) => handleFeed(appCtx, "atom", route),
        });
      }
    },
  });
}
