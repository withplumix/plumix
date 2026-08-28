import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

import { applySeoHead } from "./head.js";
import { registerSeoRoutes } from "./routes.js";
import { registerSeoSettings } from "./settings.js";
// Augmentation anchors. A `declare module "plumix"` block reaches a consumer
// only if the module declaring it is in this package's declaration graph, and
// naming them here is what stops that riding on which types the exports below
// happen to mention — drop the `og-image` line and `@plumix/plugin-og`'s
// subscription stops compiling.
import "./archive.js"; // ArchiveTypeOptions.sitemap
import "./og-image.js"; // seo:og_image
import "./robots.js"; // seo:robots-txt
import "./sitemap.js"; // seo:sitemap:urls

// Well past the default of 100, so nothing a site writes lands after this.
const LAST = 1000;

// Re-exported so a subscriber to this plugin's `seo:og_image` filter names the
// value type from the package that declares the filter — one import pulls both.
export type { OgImage } from "plumix";
export type { ArchiveTypeSitemap } from "./archive.js";
export type { SitemapUrl } from "./sitemap.js";
export { SITEMAP_PAGE_SIZE } from "./sitemap.js";
// The set-wide cache tag, for a `seo:sitemap:urls` subscriber whose own data
// changed and which has to retire what it contributed rows to.
export { SITEMAP_TAG } from "./routes.js";
// The site-wide answers the head reads, for a plugin that has to end the
// `og:image` chain the same way this one does.
export type { SeoSettings } from "./settings.js";
export { loadSeoSettings } from "./settings.js";

/**
 * Everything a public page tells a search engine: the head meta — a
 * description, a robots directive, the Open Graph set with an entry's
 * timestamps and byline, the Twitter card, and the resolved social image — plus
 * `/robots.txt` and the paged sitemap.
 *
 * Every tag is gap-filled — a theme or another plugin that set the same key
 * keeps it — so installing this adds what a page was missing and overrides
 * nothing.
 *
 * @example
 * ```ts
 * import { seo } from "@plumix/plugin-seo";
 *
 * plumix({ plugins: [seo()] });
 * ```
 */
export function seo(): PluginDescriptor {
  return definePlugin("seo", {
    i18n: {
      sourceLocale: "en",
      locales: ["en", "uk", "ar", "de", "zh-CN"],
      catalogPath: "./locales",
    },
    setup: (ctx) => {
      registerSeoSettings(ctx);
      registerSeoRoutes(ctx);
      // The assembled theme + template document arrives here, which is what
      // makes gap-filling possible: a theme's own tag is already in hand.
      //
      // Last on the chain, whatever order the config lists the plugins in. A
      // gap-filler that ran mid-chain would fill a key a later subscriber was
      // about to set, and that subscriber appending to the manifest would then
      // put two of the same tag on the page rather than override one.
      ctx.addFilter("render:document", applySeoHead, { priority: LAST });
    },
  });
}
