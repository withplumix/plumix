import type { PluginDescriptor } from "plumix/plugin";
import { enqueuePurgeTags } from "plumix/db";
import { definePlugin, loadSiteSettings } from "plumix/plugin";

import { applyFeedDiscovery } from "./discovery.js";
import { FEED_TAG, handleFeed } from "./respond.js";
import { feedRoutes } from "./routes.js";
// A `declare module "plumix"` block reaches a consumer only if its module is in
// this package's declaration graph, so the augmenting modules are imported
// explicitly.
import "./archive.js"; // ListingArchiveTypeOptions.feed
import "./items.js"; // feed:items

export type { ArchiveTypeFeed } from "./archive.js";
export type { FeedScope } from "./scope.js";
export type { FeedChannel, FeedFormat, FeedItem } from "./serialize.js";
export { FEED_LIMIT } from "./items.js";

/**
 * RSS 2.0 and Atom for every archive; a feed is its archive's own entry query,
 * newest first.
 */
export function feeds(): PluginDescriptor {
  return definePlugin("feeds", {
    setup: (ctx) => {
      ctx.addFilter("render:document", async (manifest, data, appCtx) => {
        const site = await loadSiteSettings(appCtx);
        return applyFeedDiscovery(
          manifest,
          data,
          appCtx,
          site.public === false,
        );
      });
      ctx.addAction("settings:group_changed", (changes, appCtx) => {
        if (changes.group === "site") enqueuePurgeTags(appCtx, [FEED_TAG]);
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
