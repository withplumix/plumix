import type {
  AppContext,
  PluginAfterSetupContext,
  PluginSetupContext,
} from "plumix/plugin";
import { enqueuePurgeTags, typeTag } from "plumix/db";
import { tagCdnEntry } from "plumix/plugin";
import { withBasePath } from "plumix/support";

import type { ContributedSitemap } from "./contributed.js";
import type { SeoSitemapsOptions, SitemapScope } from "./sitemap.js";
import { handleLlmsTxt, LLMS_PATH } from "./llms.js";
import { handleRobotsTxt } from "./robots.js";
import {
  loadSeoSettings,
  SEO_ROBOTS_GROUP,
  SEO_SETTINGS_GROUP,
  SEO_VERIFICATION_GROUP,
} from "./settings.js";
import {
  assertSitemapPolicyNamesScopes,
  collectSitemapUrls,
  renderSitemapIndex,
  renderSubSitemap,
  scopeIsOffered,
  SITEMAP_INDEX_PATH,
  sitemapIndexEntries,
  sitemapScopes,
  sitemapScopeStem,
} from "./sitemap.js";
import { SITEMAP_STYLESHEET, SITEMAP_STYLESHEET_PATH } from "./stylesheet.js";

const ROBOTS_PATH = "/robots.txt";

/**
 * An hour at the edge, cut short by a publish's purge; clients always
 * revalidate.
 */
const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=3600";

/**
 * On every sitemap response: flipping the indexing toggle must retire the whole
 * set, the one legitimately global invalidation.
 */
export const SITEMAP_TAG = "seo:sitemap";

/**
 * Groups that change cached responses. `site` is here because the indexing
 * toggle falls back to its legacy key there.
 */
const SEO_SETTINGS_GROUPS: ReadonlySet<string> = new Set([
  SEO_SETTINGS_GROUP,
  SEO_ROBOTS_GROUP,
  SEO_VERIFICATION_GROUP,
  "site",
]);

/**
 * Anything but a 1-based page number goes unclaimed and 404s through the
 * content router.
 */
const PAGE_SEGMENT = ":page([1-9]\\d*)";

function stylesheetHref(ctx: AppContext): string {
  return withBasePath(SITEMAP_STYLESHEET_PATH, ctx.config.basePath);
}

function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": SITEMAP_CACHE_CONTROL,
    },
  });
}

async function handleSitemapIndex(
  ctx: AppContext,
  scopes: readonly SitemapScope[],
): Promise<Response> {
  // `tagCdnEntry` unions, so scopes sharing a type tag need no dedupe here.
  tagCdnEntry(ctx, [SITEMAP_TAG, ...scopes.flatMap((scope) => scope.tags)]);
  // A site held out of the index is held out of search, and so is a scope its
  // own default holds out: either way the scope simply leaves the set.
  const settings = await loadSeoSettings(ctx);
  const listed = scopes.filter((scope) => scopeIsOffered(scope, settings));
  return xmlResponse(
    renderSitemapIndex(
      await sitemapIndexEntries(ctx, listed),
      stylesheetHref(ctx),
    ),
  );
}

async function handleSubSitemap(
  ctx: AppContext,
  scope: SitemapScope,
  page: number,
): Promise<Response> {
  tagCdnEntry(ctx, [SITEMAP_TAG, ...scope.tags]);
  const settings = await loadSeoSettings(ctx);
  const urls = scopeIsOffered(scope, settings)
    ? await collectSitemapUrls(ctx, scope, page)
    : [];
  return xmlResponse(renderSubSitemap(urls, stylesheetHref(ctx)));
}

/**
 * Excludes the sitemap itself, which depends on what the site registered; see
 * {@link registerSitemapRoutes}.
 */
export function registerSeoRoutes(
  ctx: PluginSetupContext,
  options: { readonly llmsTxt: boolean },
): void {
  ctx.registerPublicRoute({
    path: ROBOTS_PATH,
    handler: (_request, appCtx) => handleRobotsTxt(appCtx),
  });

  // Unclaimed, the path falls through to the content router like any other,
  // so a site that answers it itself can register it without a conflict.
  if (options.llmsTxt) {
    ctx.registerPublicRoute({
      path: LLMS_PATH,
      handler: (_request, appCtx) => handleLlmsTxt(appCtx),
    });
  }

  // Not `cacheable: true`: a constant document has no tag a purge would ever
  // have to retire, so it rides its shared-cache header alone.
  ctx.registerPublicRoute({
    path: SITEMAP_STYLESHEET_PATH,
    handler: () =>
      new Response(SITEMAP_STYLESHEET, {
        headers: {
          "content-type": "text/xsl; charset=utf-8",
          "cache-control": SITEMAP_CACHE_CONTROL,
        },
      }),
  });

  // The indexing toggle decides whether the sitemap has any URLs at all.
  ctx.addAction("settings:group_changed", (changes, appCtx) => {
    if (!SEO_SETTINGS_GROUPS.has(changes.group)) return;
    enqueuePurgeTags(appCtx, [
      SITEMAP_TAG,
      ...[...appCtx.plugins.entryTypes.keys()].map(typeTag),
    ]);
  });
}

/**
 * One route per scope: a public route has no fall-through, so one wildcard
 * route would claim and shadow the whole `sitemap-*.xml` space.
 */
export function registerSitemapRoutes(
  ctx: PluginAfterSetupContext,
  sitemaps: SeoSitemapsOptions,
  contributed: readonly ContributedSitemap[],
): void {
  const scopes = sitemapScopes(ctx.plugins, sitemaps, contributed);
  assertSitemapPolicyNamesScopes(sitemaps, scopes);

  ctx.registerPublicRoute({
    path: SITEMAP_INDEX_PATH,
    cacheable: true,
    handler: (_request, appCtx) => handleSitemapIndex(appCtx, scopes),
  });

  for (const scope of scopes) {
    ctx.registerPublicRoute({
      path: `/sitemap-${sitemapScopeStem(scope.ref)}-${PAGE_SEGMENT}.xml`,
      cacheable: true,
      handler: (_request, appCtx, params) =>
        handleSubSitemap(appCtx, scope, Number(params.page)),
    });
  }
}
