import type { DocumentLink, DocumentManifest, TemplateData } from "plumix";
import type { AppContext, ResolvedRoute } from "plumix/plugin";
import { FRAMEWORK_PAGINATION_SUFFIX } from "plumix/plugin";
import { withBasePath } from "plumix/support";

import { feedUnder, servesFeed } from "./routes.js";

/**
 * The path of the RSS feed a page advertises, base prefix included, or null
 * when it has none: the feed of the archive that owns the page, as the
 * dispatcher resolved it. A later page advertises the feed
 * of the route it paginates. A single entry and the search page belong to no
 * archive, so they advertise nothing — and neither does an error page, which
 * can sit at an archive's URL without being its page.
 */
function feedBase(data: TemplateData, ctx: AppContext): string | null {
  const route = ctx.resolvedRoute;
  if (data.kind === "error" || route === null) return null;
  // The route the dispatcher resolved already names the archive, so the page
  // is not matched against the route table a second time.
  const archive = route.intent;
  if (archive.kind === "single" || archive.kind === "search") return null;
  const pathname = new URL(ctx.request.url).pathname;
  const feedPath = feedUnder(listingPath(route, pathname));
  return servesFeed(ctx.plugins, archive, feedPath)
    ? withBasePath(feedPath, ctx.basePath)
    : null;
}

const SUFFIX_SEGMENTS = FRAMEWORK_PAGINATION_SUFFIX.split("/").length - 1;

// A later page's listing is its own path with the pagination tail dropped.
function listingPath(route: ResolvedRoute, pathname: string): string {
  if (!route.pattern.endsWith(FRAMEWORK_PAGINATION_SUFFIX)) return pathname;
  return pathname.split("/").slice(0, -SUFFIX_SEGMENTS).join("/");
}

/**
 * Gap-filler: append `<link rel="alternate">` feed-discovery tags for the
 * page's scope, skipping any type already present so a template / plugin value
 * wins. A private site advertises nothing (it 404s its feeds).
 */
export function applyFeedDiscovery(
  manifest: DocumentManifest,
  data: TemplateData,
  ctx: AppContext,
  siteIsPrivate: boolean,
): DocumentManifest {
  if (siteIsPrivate) return manifest;
  const base = feedBase(data, ctx);
  if (base === null) return manifest;

  const existing = manifest.link;
  const additions: DocumentLink[] = [];
  const add = (type: string, href: string): void => {
    if (existing?.some((l) => l.rel === "alternate" && l.type === type)) return;
    additions.push({ rel: "alternate", type, href });
  };
  add("application/rss+xml", `${ctx.origin}${base}`);
  add("application/atom+xml", `${ctx.origin}${base}/atom`);

  if (additions.length === 0) return manifest;
  return { ...manifest, link: [...(existing ?? []), ...additions] };
}
