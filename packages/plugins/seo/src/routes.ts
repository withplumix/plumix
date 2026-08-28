import type { AppContext, PluginSetupContext } from "plumix/plugin";
import { enqueuePurgeTags, tagCacheEntry, withBasePath } from "plumix";
import { tryGetContext } from "plumix/plugin";

import type { SitemapScope } from "./sitemap.js";
import { handleLlmsTxt, LLMS_PATH } from "./llms.js";
import { handleRobotsTxt } from "./robots.js";
import { loadSeoSettings, SEO_SETTINGS_GROUP } from "./settings.js";
import {
  collectSitemapUrls,
  renderSitemapIndex,
  renderSubSitemap,
  scopeIsOffered,
  SITEMAP_INDEX_PATH,
  sitemapIndexLocs,
  sitemapScopes,
} from "./sitemap.js";
import { SITEMAP_STYLESHEET, SITEMAP_STYLESHEET_PATH } from "./stylesheet.js";

const ROBOTS_PATH = "/robots.txt";

// A crawler refetches a sitemap on its own schedule, so the window that matters
// is the shared one: an hour at the edge, cut short by the purge a publish
// fires, while a client is told to revalidate rather than sit on a stale copy.
const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=3600";

/**
 * Carried by every sitemap response on top of its scope tags. The indexing
 * toggle changes which URLs (if any) the whole set may expose, so flipping it
 * has to retire all of them — the one invalidation that is legitimately global.
 */
export const SITEMAP_TAG = "seo:sitemap";

// The page segment is the sitemap's own pagination, not a slug, so the route
// pattern spells that out — a path that is not a 1-based page number then goes
// unclaimed and 404s through the content router, as it did before this plugin.
const PAGE_SEGMENT = ":page([1-9]\\d*)";

/** Where the stylesheet answers for this deployment. */
function stylesheetHref(ctx: AppContext): string {
  return withBasePath(SITEMAP_STYLESHEET_PATH, ctx.basePath);
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
  // `tagCacheEntry` unions, so scopes sharing a type tag need no dedupe here.
  tagCacheEntry(ctx, [SITEMAP_TAG, ...scopes.flatMap((scope) => scope.tags)]);
  // A site held out of the index is held out of search, and so is a scope its
  // own default holds out: either way the scope simply leaves the set.
  const settings = await loadSeoSettings(ctx);
  const listed = scopes.filter((scope) => scopeIsOffered(scope, settings));
  return xmlResponse(
    renderSitemapIndex(
      await sitemapIndexLocs(ctx, listed),
      stylesheetHref(ctx),
    ),
  );
}

async function handleSubSitemap(
  ctx: AppContext,
  scope: SitemapScope,
  page: number,
): Promise<Response> {
  tagCacheEntry(ctx, [SITEMAP_TAG, ...scope.tags]);
  const settings = await loadSeoSettings(ctx);
  const urls = scopeIsOffered(scope, settings)
    ? await collectSitemapUrls(ctx, scope, page)
    : [];
  return xmlResponse(renderSubSitemap(urls, stylesheetHref(ctx)));
}

/**
 * Claim `/robots.txt` and the sitemap, and keep the cached sitemap honest about
 * the indexing toggle.
 *
 * The sitemap waits for `theme:ready`, where every entry type, taxonomy and
 * archive is registered; `robots.txt` depends on none of them, so it is claimed
 * straight away.
 */
export function registerSeoRoutes(ctx: PluginSetupContext): void {
  ctx.registerPublicRoute({
    path: ROBOTS_PATH,
    handler: (_request, appCtx) => handleRobotsTxt(appCtx),
  });

  ctx.registerPublicRoute({
    path: LLMS_PATH,
    handler: (_request, appCtx) => handleLlmsTxt(appCtx),
  });

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

  ctx.addAction("theme:ready", () => {
    registerSitemapRoutes(ctx);
  });

  // The indexing toggle decides whether the sitemap has any URLs at all, so a
  // save has to retire the cached set. Both groups, because the toggle answers
  // from this plugin's own key falling back to the legacy `site` one.
  ctx.addAction("settings:group_changed", (changes) => {
    if (changes.group !== SEO_SETTINGS_GROUP && changes.group !== "site")
      return;
    // A settings write always runs inside a request; a fire outside one has no
    // cache to purge through.
    const appCtx = tryGetContext();
    if (appCtx !== null) enqueuePurgeTags(appCtx, [SITEMAP_TAG]);
  });
}

/**
 * One route per scope, enumerated from what the site registered. A registered
 * public route has no fall-through, so a single `/sitemap-:scope-:page.xml`
 * would claim the whole `sitemap-*.xml` space — answering for scopes that do
 * not exist, and shadowing anything else that wanted a path in it.
 */
function registerSitemapRoutes(ctx: PluginSetupContext): void {
  const scopes = sitemapScopes(ctx.plugins);

  ctx.registerPublicRoute({
    path: SITEMAP_INDEX_PATH,
    cacheable: true,
    handler: (_request, appCtx) => handleSitemapIndex(appCtx, scopes),
  });

  for (const scope of scopes) {
    ctx.registerPublicRoute({
      path: `/sitemap-${scope.name}-${PAGE_SEGMENT}.xml`,
      cacheable: true,
      handler: (_request, appCtx, params) =>
        handleSubSitemap(appCtx, scope, Number(params.page)),
    });
  }
}
