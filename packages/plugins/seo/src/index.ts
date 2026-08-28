import type { PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

import type { SeoMetaBoxOptions } from "./meta-box.js";
import { applySeoHead } from "./head.js";
import { registerIndexNow } from "./indexnow.js";
import { registerSeoEditorSurfaces } from "./meta-box.js";
import { registerSeoRoutes } from "./routes.js";
import { registerSeoSettings } from "./settings.js";
// Augmentation anchors. A `declare module "plumix"` block reaches a consumer
// only if the module declaring it is in this package's declaration graph, and
// naming them here is what stops that riding on which types the exports below
// happen to mention — drop the `og-image` line and `@plumix/plugin-og`'s
// subscription stops compiling.
import "./archive.js"; // ArchiveTypeOptions.sitemap
import "./llms.js"; // seo:llms-txt
import "./og-image.js"; // seo:og_image
import "./robots.js"; // seo:robots-txt
import "./schema.js"; // seo:schema:needs, seo:schema:piece, seo:schema:graph
import "./sitemap.js"; // seo:sitemap:urls

// Well past the default of 100, so nothing a site writes lands after this.
const LAST = 1000;

// Resolved against the consuming site, the way every plugin admin entry is.
const ADMIN_ENTRY_PATH = "node_modules/@plumix/plugin-seo/dist/admin/index.js";

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
// The one answer behind the robots directive and sitemap membership, and the
// meta keys an editor's answers are stored under.
export type { Indexability, IndexabilityReason } from "./indexable.js";
export { indexable } from "./indexable.js";
export { SEO_META_KEYS } from "./overrides.js";
export type { SeoMetaBoxOptions } from "./meta-box.js";
// What the editor's SERP preview is written from, and the counters' limits —
// shared with the admin chunk so the two cannot disagree about either.
export type { SerpOverrides, SerpPreview, SerpResult } from "./serp.js";
export {
  resolveSerp,
  SERP_DESCRIPTION_LIMIT,
  SERP_TITLE_LIMIT,
} from "./serp.js";
// The structured-data vocabulary, for a plugin describing its own content
// through the three `seo:schema:*` tiers, and the serializer behind it for one
// emitting a script of its own.
export type { SchemaPiece, SchemaPieceName, SchemaType } from "./schema.js";
export { DEFAULT_SCHEMA_TYPE, SCHEMA_TYPES } from "./schema.js";
export { serializeJsonLd } from "./json-ld.js";
// The trail, and the component that draws it. One source, so what the page
// shows and what its `BreadcrumbList` claims cannot disagree.
export type { BreadcrumbItem } from "./breadcrumbs.js";
export { Breadcrumbs, breadcrumbTrail } from "./breadcrumbs.js";

/** How the plugin is installed. Every field is optional. */
export interface SeoOptions {
  /** Which entry types and taxonomies carry the per-entry SEO box. */
  readonly metaBox?: SeoMetaBoxOptions;
}

/**
 * Everything a public page tells a search engine: the head meta — a
 * description, a robots directive, the Open Graph set with an entry's
 * timestamps and byline, the Twitter card, and the resolved social image — plus
 * `/robots.txt` and the paged sitemap.
 *
 * On every publicly-visible entry type and taxonomy an editor also gets a
 * **Search & social** box: a search title, a search description, a canonical
 * override, a social image, and `noindex` / `nofollow` flags. The `noindex`
 * flag reaches the head and the sitemap through one predicate, so a page
 * cannot claim `noindex` while still being listed.
 *
 * Every indexable page also carries a cross-referenced structured-data graph —
 * website, publisher, page, article, breadcrumbs, image and author, each
 * addressable by URL fragment — which a plugin can narrow, reshape or replace
 * through the three `seo:schema:*` filters. {@link Breadcrumbs} draws the same
 * trail the graph publishes.
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
export function seo(options: SeoOptions = {}): PluginDescriptor {
  return definePlugin("seo", {
    // The chunk the SERP preview's field renderer registers from. Without it
    // the preview falls through to the admin's text-input fallback.
    adminEntry: ADMIN_ENTRY_PATH,
    i18n: {
      sourceLocale: "en",
      locales: ["en", "uk", "ar", "de", "zh-CN"],
      catalogPath: "./locales",
    },
    setup: (ctx) => {
      registerSeoSettings(ctx);
      registerSeoRoutes(ctx);
      registerIndexNow(ctx);
      registerSeoEditorSurfaces(ctx, options.metaBox ?? {});
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
