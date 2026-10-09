import type {
  AppContext,
  PluginAfterSetupContext,
  PluginSetupContext,
} from "plumix/plugin";
import { recordRead } from "plumix/plugin";
import { withBasePath } from "plumix/support";

import type { ContributedSitemap } from "./contributed.js";
import type { SeoSitemapsOptions, SitemapScope } from "./sitemap.js";
import { handleLlmsTxt, LLMS_PATH } from "./llms.js";
import { handleRobotsTxt } from "./robots.js";
import { loadSeoSettings } from "./settings.js";
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

// A crawler refetches a sitemap on its own schedule, so the window that matters
// is the shared one: an hour at the edge, cut short by the purge a publish
// fires, while a client is told to revalidate rather than sit on a stale copy.
const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=3600";

/**
 * The sitemap set as a whole, read by every sitemap response on top of its
 * scope's reads. A plugin whose `seo:sitemap:urls` rows come from data of its
 * own records a write to it when that data changes, retiring the whole set.
 */
export const SITEMAP_SET = {
  kind: "own",
  namespace: "seo",
  id: "sitemap",
} as const;

// The page segment is the sitemap's own pagination, not a slug, so the route
// pattern spells that out — a path that is not a 1-based page number then goes
// unclaimed and 404s through the content router, as it did before this plugin.
const PAGE_SEGMENT = ":page([1-9]\\d*)";

/** Where the stylesheet answers for this deployment. */
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
  // `recordRead` unions, so scopes sharing a type need no dedupe here.
  recordRead(ctx, [SITEMAP_SET, ...scopes.flatMap((scope) => scope.reads)]);
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
  recordRead(ctx, [SITEMAP_SET, ...scope.reads]);
  const settings = await loadSeoSettings(ctx);
  const urls = scopeIsOffered(scope, settings)
    ? await collectSitemapUrls(ctx, scope, page)
    : [];
  return xmlResponse(renderSubSitemap(urls, stylesheetHref(ctx)));
}

/**
 * Claim `/robots.txt`, `/llms.txt` (unless the site turned it off) and the
 * sitemap stylesheet. None of it depends on what the site registered; the
 * sitemap does, so {@link registerSitemapRoutes} claims it from `afterSetup`.
 * The cached sitemap needs no listener for the indexing toggle: it read the
 * settings groups the toggle lives in, so core's purge of a saved group
 * retires it.
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
}

/**
 * One route per scope, enumerated from what the site registered. A registered
 * public route has no fall-through, so a single `/sitemap-:scope-:page.xml`
 * would claim the whole `sitemap-*.xml` space — answering for scopes that do
 * not exist, and shadowing anything else that wanted a path in it.
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
