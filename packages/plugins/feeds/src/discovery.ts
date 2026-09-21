import type {
  CustomArchiveData,
  DocumentLink,
  DocumentManifest,
  TemplateData,
} from "plumix";
import type { AppContext, ResolvedRoute } from "plumix/plugin";
import { entryQuery } from "plumix/db";
import {
  exposesHierarchicalUrls,
  FRAMEWORK_PAGINATION_SUFFIX,
} from "plumix/plugin";
import { withBasePath } from "plumix/support";

import { archiveFeedAt, feedUnder, isSyndicatable } from "./routes.js";
import { feedGuard, isPublicEntryType } from "./scope.js";

/**
 * The path of the RSS feed a page advertises, base prefix included, or null
 * when it has none. Discriminates on the payload's own `kind` — a plugin
 * archive's shape is arbitrary, so a field-presence check would read one
 * plugin's `year` or `author` as core's subject.
 */
function feedBase(data: TemplateData, ctx: AppContext): string | null {
  switch (data.kind) {
    // A single entry advertises the site feed rather than its type's: a reader
    // subscribing from a post wants "everything new", which is the convention
    // (WordPress et al.).
    case "entry":
    case "frontPage":
      return withBasePath("/feed", ctx.basePath);
    case "archive":
      return isPublicEntryType(ctx.plugins, data.contentType)
        ? withBasePath(`/${data.contentType}/feed`, ctx.basePath)
        : null;
    case "taxonomy": {
      const taxonomy = ctx.plugins.termTaxonomies.get(data.taxonomy);
      if (!taxonomy?.isPublic) return null;
      // `term.url` is this archive's own URL, ancestors and base prefix
      // included. Its feed hangs off it only where that URL is the one the
      // term route resolves back through: the flat form for a top-level term,
      // the nested form where the taxonomy exposes hierarchical URLs. The
      // taxonomy loop in routes.ts claims exactly that set.
      if (data.term.url === null) return null;
      if (data.term.parentId !== null && !exposesHierarchicalUrls(taxonomy)) {
        return null;
      }
      return `${data.term.url}/feed`;
    }
    case "author":
      return withBasePath(`/authors/${data.author.slug}/feed`, ctx.basePath);
    case "date": {
      const parts = [String(data.year)];
      if (data.month !== null) parts.push(String(data.month).padStart(2, "0"));
      if (data.day !== null) parts.push(String(data.day).padStart(2, "0"));
      return withBasePath(`/${parts.join("/")}/feed`, ctx.basePath);
    }
    case "custom":
      return archiveFeedBase(data, ctx);
    // A search page is thin and an error page is not content.
    case "search":
    case "error":
      return null;
  }
}

/**
 * A plugin archive's feed, read off the route the page matched rather than
 * its payload, whose shape is the plugin's own. A later page advertises the
 * feed of the route it paginates. Not advertised: a path another feed claimed
 * first, or params the archive's `scope` answers `null` for. The scope is
 * asked but its query is not compiled — that would cost a lookup on every
 * archive page — so a narrowing that fails only at compile time is advertised
 * and its feed 404s.
 */
function archiveFeedBase(
  data: CustomArchiveData,
  ctx: AppContext,
): string | null {
  const archive = ctx.plugins.archiveTypes.get(data.name);
  const route = ctx.resolvedRoute;
  if (archive === undefined || !isSyndicatable(archive) || route === null) {
    return null;
  }

  const pathname = new URL(ctx.request.url).pathname;
  const feedPath = feedUnder(listingPath(route, pathname));
  const owner = archiveFeedAt(ctx.plugins, feedPath);
  if (owner?.archive !== archive.name) return null;
  const guard = feedGuard(ctx.plugins);
  if (
    guard === null ||
    archive.feed.scope(entryQuery().where(guard), owner.params) === null
  ) {
    return null;
  }
  return withBasePath(feedPath, ctx.basePath);
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
