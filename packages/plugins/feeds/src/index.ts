import type { PluginDescriptor } from "plumix/plugin";
import { enqueuePurgeTags } from "plumix/db";
import { definePlugin, loadSiteSettings } from "plumix/plugin";

import { applyFeedDiscovery } from "./discovery.js";
import { FEED_TAG, handleFeed } from "./respond.js";
import { feedRoutes } from "./routes.js";
// Augmentation anchors. A `declare module "plumix"` block reaches a consumer
// only if the module declaring it is in this package's declaration graph, and
// naming them here is what stops that riding on which types the exports below
// happen to mention.
import "./archive.js"; // ListingArchiveTypeOptions.feed
import "./items.js"; // feed:items

export type { ArchiveTypeFeed } from "./archive.js";
export type { FeedScope } from "./scope.js";
export type { FeedChannel, FeedFormat, FeedItem } from "./serialize.js";
export { renderAtom, renderRss2 } from "./serialize.js";
export { FEED_LIMIT } from "./items.js";

/**
 * `@plumix/plugin-feeds` — RSS 2.0 and Atom for every archive: the front
 * page, an entry type, a taxonomy term, an author, a date period, and any
 * archive a plugin registered with `feed: true`. A feed is its archive's own
 * entry query, read newest first (ADR 0008).
 *
 * Routes are claimed in `afterSetup`, once every archive is registered, beside
 * each route core lists the archive at — so a path this plugin does not claim
 * still renders as content. Each page's own feed is advertised through
 * `render:document`, gap-filling around whatever the theme already declared.
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
          handler: (_request, appCtx) =>
            handleFeed(appCtx, "rss2", route.cacheable),
        });
        ctx.registerPublicRoute({
          path: `${route.path}/atom`,
          cacheable: route.cacheable,
          handler: (_request, appCtx) =>
            handleFeed(appCtx, "atom", route.cacheable),
        });
      }
    },
  });
}
