import type { PluginDescriptor } from "plumix/plugin";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "plumix/plugin";

import type { SeoMetaBoxOptions } from "./meta-box.js";
import type { SeoSitemapsOptions } from "./sitemap.js";
// Also anchors the `registerSitemap` augmentation, as the imports below do
// theirs.
import { contributedSitemaps, createRegisterSitemap } from "./contributed.js";
import { applySeoHead } from "./head.js";
import { assertIndexViewsNameViews } from "./indexable.js";
import { registerIndexNow } from "./indexnow.js";
import { registerSeoEditorSurfaces } from "./meta-box.js";
import { SERP_PREVIEW_INPUT_TYPE } from "./preview-box.js";
import { registerSeoRoutes, registerSitemapRoutes } from "./routes.js";
import {
  registerSeoSettings,
  registerSeoSettingsDefaults,
} from "./settings.js";
// A `declare module "plumix"` block reaches consumers only if its module is in
// the declaration graph; without these, `@plumix/plugin-og` stops compiling.
import "./llms.js"; // seo:llms-txt
import "./og-image.js"; // seo:og_image
import "./robots.js"; // seo:robots-txt
import "./schema.js"; // seo:schema:needs, seo:schema:piece, seo:schema:graph
import "./sitemap.js"; // seo:sitemap:urls

// Well past the default of 100, so nothing a site writes lands after this.
const LAST = 1000;

// Resolved against the consuming site, the way every plugin admin entry is.
const ADMIN_ENTRY_PATH = pluginAdminEntryPath("@plumix/plugin-seo");

// Re-exported so a subscriber to this plugin's `seo:og_image` filter names the
// value type from the package that declares the filter — one import pulls both.
export type { OgImage } from "plumix";
export type { SitemapSource } from "./contributed.js";
export type {
  SeoSitemapsOptions,
  SitemapChangeFrequency,
  SitemapScopePolicy,
  SitemapScopeRef,
  SitemapUrl,
} from "./sitemap.js";
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
  /**
   * Serve `/llms.txt`. On by default; `false` leaves the path unclaimed, so it
   * 404s or a site plugin can answer it, and `seo:llms-txt` never fires.
   */
  readonly llmsTxt?: boolean;
  /**
   * Write `article:published_time`, `article:modified_time` and
   * `article:author` on an entry page. On by default; `false` drops the whole
   * `article:*` family, while `og:type` still says `article`.
   */
  readonly articleTags?: boolean;
  /**
   * Build the JSON-LD graph and append it as an `application/ld+json` script.
   * On by default; `false` builds nothing, so no `seo:schema:*` filter fires.
   * {@link Breadcrumbs} and {@link breadcrumbTrail} still work.
   */
  readonly structuredData?: boolean;
  /**
   * The site's sitemap policy, per scope: the `changefreq` and `priority` its
   * URLs default to. A URL's own values, and then the `seo:sitemap:urls`
   * filter, override it.
   */
  readonly sitemaps?: SeoSitemapsOptions;
  /**
   * Views are `noindex` unless named here; an unknown name fails the boot. An
   * indexed view gets a canonical only if its template's `document` declares
   * one.
   */
  readonly indexViews?: readonly string[];
}

/**
 * Every tag is gap-filled: a theme or plugin that set the same key keeps it,
 * so installing this overrides nothing.
 */
export function seo(options: SeoOptions = {}): PluginDescriptor {
  const headOptions = {
    articleTags: options.articleTags ?? true,
    structuredData: options.structuredData ?? true,
    indexViews: new Set(options.indexViews),
  };
  return definePlugin("seo", {
    // The chunk the SERP preview's field renderer ships in. Without it the
    // preview falls through to the admin's text-input fallback.
    adminEntry: ADMIN_ENTRY_PATH,
    i18n: PLUGIN_I18N_SLOT,
    // One list per install, not per `seo()` call: a descriptor is a value that
    // may be installed into more than one app.
    provides: (ctx) => {
      ctx.extendPluginContext("registerSitemap", createRegisterSitemap());
    },
    setup: (ctx) => {
      registerSeoSettingsDefaults(ctx);
      registerSeoRoutes(ctx, { llmsTxt: options.llmsTxt ?? true });
      registerIndexNow(ctx);
      // Declared here so the bundler synthesises the admin-chunk registration.
      ctx.registerFieldType({
        type: SERP_PREVIEW_INPUT_TYPE,
        component: "SerpPreviewField",
      });
      // Last on the chain: a gap-filler mid-chain would fill a key a later
      // subscriber then appends again, putting two of the same tag on the page.
      ctx.addFilter(
        "render:document",
        (manifest, data, appCtx, title) =>
          applySeoHead(manifest, data, appCtx, title, headOptions),
        { priority: LAST },
      );
    },
    // Each of these is scoped to what the site registered, so it waits for
    // every plugin's `setup` to have registered it.
    afterSetup: (ctx) => {
      assertIndexViewsNameViews(headOptions.indexViews, ctx.plugins.views);
      registerSeoSettings(ctx);
      registerSitemapRoutes(
        ctx,
        options.sitemaps ?? {},
        // eslint-disable-next-line @typescript-eslint/unbound-method -- an identity key, never called
        contributedSitemaps(ctx.registerSitemap),
      );
      registerSeoEditorSurfaces(ctx, options.metaBox ?? {});
    },
  });
}
