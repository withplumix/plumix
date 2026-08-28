import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin, loadSiteSettings } from "plumix";

import { applyFeedDiscovery } from "./discovery.js";
import { handleFeed } from "./respond.js";
import { feedRoutes } from "./routes.js";
// Augmentation anchors. A `declare module "plumix"` block reaches a consumer
// only if the module declaring it is in this package's declaration graph, and
// naming them here is what stops that riding on which types the exports below
// happen to mention.
import "./archive.js"; // ArchiveTypeOptions.feed
import "./items.js"; // feed:items

export type { ArchiveTypeFeed } from "./archive.js";
export type { FeedScope } from "./scope.js";
export type { FeedChannel, FeedFormat, FeedItem } from "./serialize.js";
export { renderAtom, renderRss2 } from "./serialize.js";
export { FEED_LIMIT } from "./items.js";

/**
 * `@plumix/plugin-feeds` — RSS 2.0 and Atom for the site and every public
 * archive: an entry type, a taxonomy term, an author, a date period, and any
 * archive a plugin registered with a `feed`.
 *
 * Routes are claimed at `theme:ready`, when every entry type and taxonomy is
 * registered, so each one is enumerated from what the site registered rather
 * than matched as an ambiguous shape per request — a path this plugin does not
 * claim still renders as content. Each page's own feed is advertised through
 * `render:document`, gap-filling around whatever the theme already declared.
 */
export function feeds(): PluginDescriptor {
  return definePlugin("feeds", {
    setup: (ctx) => {
      ctx.addAction("theme:ready", () => {
        for (const route of feedRoutes(ctx.plugins)) {
          ctx.registerPublicRoute({
            path: route.path,
            handler: (_request, appCtx, params) =>
              handleFeed(appCtx, route.scope(params), "rss2"),
          });
          ctx.registerPublicRoute({
            path: `${route.path}/atom`,
            handler: (_request, appCtx, params) =>
              handleFeed(appCtx, route.scope(params), "atom"),
          });
        }
      });

      ctx.addFilter("render:document", async (manifest, data, appCtx) => {
        const site = await loadSiteSettings(appCtx);
        return applyFeedDiscovery(
          manifest,
          data,
          appCtx,
          site.public === false,
        );
      });
    },
  });
}
