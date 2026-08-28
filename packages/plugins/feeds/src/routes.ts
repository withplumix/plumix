import type { PluginRegistry } from "plumix";
import { exposesHierarchicalUrls } from "plumix";

import type { FeedScope } from "./scope.js";
import { publicEntryTypeNames, publicTaxonomiesByBaseSlug } from "./scope.js";

/** `/authors/:slug` is core's framework route; its feed hangs off the same shape. */
const AUTHOR_FEED = "/authors/:slug/feed";
/**
 * The suffix every feed path ends in. An archive's declared feed route has to
 * carry it too: a registered public route answers ahead of the content router,
 * so a route that is not feed-shaped would serve XML at the archive's own page
 * URL and the page would be gone with no boot error.
 */
const FEED_SUFFIX = "/feed";
// Date-archive URL space is numeric-constrained the way core's own date rules
// are, so `/about/feed` stays a page rather than being read as a year feed.
const YEAR = ":year(\\d{4})";
const MONTH = ":month(\\d{2})";
const DAY = ":day(\\d{2})";

/**
 * One RSS route the plugin owns. The Atom variant is `${path}/atom` — declared
 * once here and expanded at registration, so the two formats cannot drift.
 * `scope` reads the pattern's captured groups; every route it can produce is
 * checked at request time, so an unknown author or term 404s rather than
 * falling through (a registered public route has no fall-through).
 */
export interface FeedRoute {
  readonly path: string;
  readonly scope: (params: Record<string, string>) => FeedScope;
}

/**
 * Every feed path the site has, enumerated from what is registered rather than
 * matched as an ambiguous pattern per request. Enumeration is the point: a
 * registered public route always answers, so a claimed `/:type/feed` would
 * swallow a page slugged `feed` under some other prefix. The only patterns
 * claimed are URL space something else already reserved: the author archive,
 * the date archives, each taxonomy's archive space, and whatever a plugin
 * archive declared for itself.
 *
 * Order matters between patterns: the first that matches answers, so the
 * reserved framework shapes are claimed ahead of a plugin archive's own feed
 * routes, and both ahead of a taxonomy's archive space.
 */
export function feedRoutes(plugins: PluginRegistry): readonly FeedRoute[] {
  const routes: FeedRoute[] = [
    { path: "/feed", scope: () => ({ kind: "site" }) },
  ];

  for (const type of publicEntryTypeNames(plugins)) {
    routes.push({
      path: `/${type}/feed`,
      scope: () => ({ kind: "type", type }),
    });
  }

  routes.push({
    path: AUTHOR_FEED,
    scope: (params) => ({ kind: "author", slug: params.slug ?? "" }),
  });

  for (const segments of [[YEAR], [YEAR, MONTH], [YEAR, MONTH, DAY]]) {
    routes.push({
      path: `/${segments.join("/")}/feed`,
      scope: (params) => ({
        kind: "date",
        year: Number(params.year),
        month: params.month === undefined ? null : Number(params.month),
        day: params.day === undefined ? null : Number(params.day),
      }),
    });
  }

  for (const archive of plugins.archiveTypes.values()) {
    for (const path of archive.feed?.routes ?? []) {
      if (!path.endsWith(FEED_SUFFIX)) continue;
      routes.push({
        path,
        scope: (params) => ({ kind: "custom", name: archive.name, params }),
      });
    }
  }

  for (const [baseSlug, taxonomy] of publicTaxonomiesByBaseSlug(plugins)) {
    // A nested term path is addressable only where the taxonomy exposes
    // hierarchical URLs — the same `:path+` / single-segment split the archive
    // rules compile to, so a term's feed sits directly under its archive.
    // `feedBase` in discovery.ts gates on the same rule; a page must not
    // advertise a term feed this loop did not claim.
    const capture = exposesHierarchicalUrls(taxonomy) ? ":path+" : ":path";
    routes.push({
      path: `/${baseSlug}/${capture}/feed`,
      scope: (params) => ({
        kind: "term",
        taxonomy: taxonomy.name,
        path: (params.path ?? "").split("/"),
      }),
    });
  }

  // Two routes can name one path — an entry type called `events` beside an
  // archive feed at `/events/feed`, or two archives sharing a route. Core's
  // dispatcher answered the first branch that matched; keeping the first claim
  // does the same, where handing both to `registerPublicRoute` would fail the
  // boot with an error naming this plugin as its own rival.
  const claimed = new Set<string>();
  return routes.filter((route) => {
    if (claimed.has(route.path)) return false;
    claimed.add(route.path);
    return true;
  });
}
