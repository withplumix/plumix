import type {
  ArchiveAtPath,
  EntryArchive,
  PluginRegistry,
} from "plumix/plugin";
import { publicEntryRows } from "plumix/db";
import {
  archiveAtPath,
  archiveBaseRoutes,
  FRAMEWORK_PAGINATION_SUFFIX,
} from "plumix/plugin";

import { isSyndicatableEntryType } from "./scope.js";

/** The feed under one listing path, a route pattern or a concrete URL alike. */
export function feedUnder(path: string): string {
  return `${path.replace(/\/$/, "")}/feed`;
}

/**
 * Whether this archive's feed is one we can serve. A type whose entries no
 * feed may carry has none. Nor does a plugin archive that did not opt in, or
 * one behind an `access` policy: core matches a registered public route ahead
 * of the access gate and ahead of loading a principal, so a feed served there
 * has no reader to check the policy against (#2520).
 */
function hasFeed(plugins: PluginRegistry, archive: EntryArchive): boolean {
  switch (archive.kind) {
    case "archive":
      return isSyndicatableEntryType(plugins.entryTypes.get(archive.entryType));
    case "custom": {
      const registered = plugins.archiveTypes.get(archive.name);
      return registered?.feed !== undefined && registered.access === undefined;
    }
    case "front-page":
    case "taxonomy":
    case "author":
    case "date":
      return true;
  }
}

// One archive's identity, whichever of its routes named it.
function archiveKey(archive: EntryArchive): string {
  switch (archive.kind) {
    case "archive":
      return `archive:${archive.entryType}`;
    case "taxonomy":
      return `taxonomy:${archive.taxonomy}`;
    case "custom":
      return `custom:${archive.name}`;
    case "front-page":
    case "author":
    case "date":
      return archive.kind;
  }
}

/**
 * One RSS route the plugin owns. The Atom variant is `${path}/atom` — declared
 * once here and expanded at registration, so the two formats cannot drift.
 */
export interface FeedRoute {
  readonly path: string;
  readonly archive: EntryArchive;
  /**
   * A plugin archive's feed follows the archive's own CDN opt-in: core can't
   * see what it depends on beyond entries. Every built-in archive's is cached.
   */
  readonly cacheable: boolean;
}

/**
 * A feed beside every route an archive is listed at, read from core's own
 * list of them in the order the router matches them — so a feed follows its
 * archive wherever the permalink configuration moved it, and an archive with
 * no page has no feed.
 */
export function feedRoutes(plugins: PluginRegistry): readonly FeedRoute[] {
  const routes: FeedRoute[] = [];
  // Two archives can share a route. The router answers the first; keeping the
  // first claim does the same, where handing both to `registerPublicRoute`
  // would fail the boot with an error naming this plugin as its own rival.
  const claimed = new Set<string>();
  for (const { archive, pattern } of archiveBaseRoutes(plugins)) {
    if (!hasFeed(plugins, archive)) continue;
    const path = feedUnder(pattern);
    if (claimed.has(path)) continue;
    claimed.add(path);
    routes.push({
      path,
      archive,
      cacheable:
        archive.kind !== "custom" ||
        plugins.archiveTypes.get(archive.name)?.cacheable === true,
    });
  }
  return routes;
}

// What core's public-route table reads as a pattern rather than a literal
// path. It matches a literal ahead of every pattern, so which feed route
// answers a path has to be asked the same way.
const PATTERN_SYNTAX = /[:*?+(){}[\]]/;

interface CompiledFeedRoutes {
  /** The archive each literal feed path belongs to. */
  readonly literals: ReadonlyMap<string, string>;
  readonly patterns: readonly {
    readonly pattern: URLPattern;
    readonly archive: string;
  }[];
  // The `/page/:page` form of each archive route, which a listing path can
  // match without being a listing of its own.
  readonly laterPages: readonly {
    readonly pattern: URLPattern;
    readonly archive: string;
  }[];
}

// The registry is settled once `afterSetup` has claimed the feed routes, so
// they are compiled once per registry rather than on every request.
const compiled = new WeakMap<PluginRegistry, CompiledFeedRoutes>();

function compiledFor(plugins: PluginRegistry): CompiledFeedRoutes {
  let routes = compiled.get(plugins);
  if (routes === undefined) {
    const feeds = feedRoutes(plugins);
    routes = {
      literals: new Map(
        feeds
          .filter((route) => !PATTERN_SYNTAX.test(route.path))
          .map((route) => [route.path, archiveKey(route.archive)]),
      ),
      patterns: feeds
        .filter((route) => PATTERN_SYNTAX.test(route.path))
        .map((route) => ({
          pattern: new URLPattern({ pathname: route.path }),
          archive: archiveKey(route.archive),
        })),
      laterPages: archiveBaseRoutes(plugins).map((route) => ({
        pattern: new URLPattern({
          pathname: `${route.pattern.replace(/\/$/, "")}${FRAMEWORK_PAGINATION_SUFFIX}`,
        }),
        archive: archiveKey(route.archive),
      })),
    };
    compiled.set(plugins, routes);
  }
  return routes;
}

/**
 * The archive whose feed a concrete RSS or Atom path serves, as core's archive
 * lookup answers for the listing the feed hangs off. `null` — a 404, and
 * nothing to advertise — where that listing is no archive with a feed, where
 * it is a later page of one, where the site routes no public type, and where
 * the feed route core's dispatcher would answer the path with belongs to
 * another archive than the listing does — that route's handler is the one
 * that runs, and it cannot serve a feed of different entries under its own
 * caching.
 *
 * Building the answer runs no query: a term or author the archive's query
 * names is looked up when the feed is served, so a page can ask this to decide
 * what to advertise without paying for it.
 */
export function feedAt(
  plugins: PluginRegistry,
  feedPath: string,
): ArchiveAtPath | null {
  if (publicEntryRows(plugins) === null) return null;
  const rssPath = feedPath.replace(/\/feed\/atom$/, "/feed");
  const listing = rssPath.replace(/\/feed$/, "") || "/";
  const found = archiveAtPath(plugins, listing);
  if (found === null || !hasFeed(plugins, found.archive)) return null;

  const key = archiveKey(found.archive);
  const { literals, patterns, laterPages } = compiledFor(plugins);
  const isLaterPage = laterPages.some(
    (route) =>
      route.archive === key && route.pattern.test({ pathname: listing }),
  );
  if (isLaterPage) return null;
  const owner =
    literals.get(rssPath) ??
    patterns.find(({ pattern }) => pattern.test({ pathname: rssPath }))
      ?.archive;
  return owner === key ? found : null;
}
