import type {
  AppContext,
  DocumentLink,
  DocumentManifest,
  TemplateData,
} from "plumix";
import { exposesHierarchicalUrls, withBasePath } from "plumix";

import { isPublicEntryType } from "./scope.js";

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
      if (!taxonomy || taxonomy.isPublic === false) return null;
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
    // A search page is thin, an error page is not content, and a plugin
    // archive's feed routes are the plugin's own to advertise.
    case "search":
    case "error":
    case "custom":
      return null;
  }
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
