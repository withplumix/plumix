import type { PluginRegistry, RegisteredArchiveType } from "plumix/plugin";
import {
  exposesHierarchicalUrls,
  FRAMEWORK_PAGINATION_SUFFIX,
} from "plumix/plugin";

import type { ArchiveTypeFeed } from "./archive.js";
import type { FeedScope } from "./scope.js";
import {
  publicTaxonomiesByBaseSlug,
  syndicatableEntryTypeNames,
} from "./scope.js";

/** `/authors/:slug` is core's framework route; its feed hangs off the same shape. */
const AUTHOR_FEED = "/authors/:slug/feed";

// Date-archive URL space is numeric-constrained the way core's own date rules
// are, so `/about/feed` stays a page rather than being read as a year feed.
const YEAR = ":year(\\d{4})";
const MONTH = ":month(\\d{2})";
const DAY = ":day(\\d{2})";

/** The feed under one listing path, a route pattern or a concrete URL alike. */
export function feedUnder(path: string): string {
  return `${path.replace(/\/$/, "")}/feed`;
}

/** The listing a concrete RSS or Atom feed path hangs off. */
export function listingUnder(feedPath: string): string {
  return feedPath.replace(/\/feed(\/atom)?$/, "");
}

function isPaginated(route: string): boolean {
  return route.endsWith(FRAMEWORK_PAGINATION_SUFFIX);
}

/**
 * Whether a listing path is a later page of the archive. A multi-segment
 * capture's feed (`/docs/:path+/feed`) also answers `/docs/a/page/2/feed`,
 * whose listing is a page of another rather than a listing of its own.
 */
export function isLaterPage(
  archiveRoutes: readonly string[],
  listingPath: string,
): boolean {
  let paginated = paginatedPatterns.get(archiveRoutes);
  if (!paginated) {
    paginated = archiveRoutes
      .filter(isPaginated)
      .map((route) => new URLPattern({ pathname: route }));
    paginatedPatterns.set(archiveRoutes, paginated);
  }
  return paginated.some((pattern) => pattern.test({ pathname: listingPath }));
}

// Compiled once per archive's route list rather than on every feed request.
const paginatedPatterns = new WeakMap<
  readonly string[],
  readonly URLPattern[]
>();

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
  /**
   * Absent, the feed is cached. A plugin archive's feed follows the archive's
   * own opt-in: core can't see what it depends on beyond entries.
   */
  readonly cacheable?: boolean;
  /** The plugin archive whose feed this is; absent on every core scope. */
  readonly archive?: string;
}

/**
 * Whether this archive's feed is one we can serve. An archive behind an
 * `access` policy is not: core matches a registered public route ahead of the
 * access gate and ahead of loading a principal, so a feed served there has no
 * reader to check the policy against and would answer a policied archive's
 * entries to anyone who asked. Nothing is lost by declining — the alternative
 * on offer is the ungated feed, not a gated one (#2520).
 */
export function isSyndicatable(
  archive: RegisteredArchiveType,
): archive is RegisteredArchiveType & { readonly feed: ArchiveTypeFeed } {
  return archive.feed !== undefined && archive.access === undefined;
}

/**
 * Every feed path the site has, enumerated from what is registered rather than
 * matched as an ambiguous pattern per request. Enumeration is the point: a
 * registered public route always answers, so a claimed `/:type/feed` would
 * swallow a page slugged `feed` under some other prefix. The only patterns
 * claimed are URL space something else already reserved: the author archive,
 * the date archives, each taxonomy's archive space, and the space under each
 * route a syndicated plugin archive registered.
 *
 * Order matters between patterns: the first that matches answers, so the
 * reserved framework shapes are claimed ahead of a plugin archive's own feed
 * routes, and both ahead of a taxonomy's archive space.
 */
export function feedRoutes(plugins: PluginRegistry): readonly FeedRoute[] {
  const routes: FeedRoute[] = [
    { path: "/feed", scope: () => ({ kind: "site" }) },
  ];

  for (const type of syndicatableEntryTypeNames(plugins)) {
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
    if (!isSyndicatable(archive)) continue;
    for (const route of archive.routes) {
      if (isPaginated(route)) continue;
      routes.push({
        path: feedUnder(route),
        scope: (params) => ({ kind: "custom", name: archive.name, params }),
        cacheable: archive.cacheable === true,
        archive: archive.name,
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

interface CompiledFeedRoute {
  readonly pattern: URLPattern;
  readonly archive: string | undefined;
}

// The registry is settled once `afterSetup` has claimed the feed routes, so
// they are compiled once per registry rather than on every render.
const compiledFeedRoutes = new WeakMap<
  PluginRegistry,
  readonly CompiledFeedRoute[]
>();

/**
 * The plugin archive whose feed answers a concrete feed path, with the params
 * that feed's route captures from it. Null where no archive feed answers the
 * path, and where another feed's pattern answers it too: which of two owners
 * serves is the router's tie-break, not something a page can promise.
 */
export function archiveFeedAt(
  plugins: PluginRegistry,
  pathname: string,
): {
  readonly archive: string;
  readonly params: Record<string, string>;
} | null {
  let compiled = compiledFeedRoutes.get(plugins);
  if (!compiled) {
    compiled = feedRoutes(plugins).map((route) => ({
      pattern: new URLPattern({ pathname: route.path }),
      archive: route.archive,
    }));
    compiledFeedRoutes.set(plugins, compiled);
  }
  const matches = compiled.filter(({ pattern }) => pattern.test({ pathname }));
  const owners = new Set(matches.map((match) => match.archive));
  // Two routes of one archive answering the URL leave no doubt whose feed it
  // is; the first of them is the one that serves.
  const first = owners.size === 1 ? matches[0] : undefined;
  const result = first?.pattern.exec({ pathname });
  if (first?.archive === undefined || !result) return null;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(result.pathname.groups)) {
    if (value !== undefined) params[key] = value;
  }
  return { archive: first.archive, params };
}
