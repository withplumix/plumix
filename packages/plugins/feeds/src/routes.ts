import type {
  ArchiveAtPath,
  ArchiveBaseRoute,
  ArchiveReader,
  EntryArchive,
  PluginRegistry,
} from "plumix/plugin";
import { publicEntryRows } from "plumix/db";
import {
  archiveAtPath,
  archiveBaseRoutes,
  FRAMEWORK_PAGINATION_SUFFIX,
  publicRouteAt,
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
  return feedRoutesOver(plugins, archiveBaseRoutes(plugins));
}

function feedRoutesOver(
  plugins: PluginRegistry,
  baseRoutes: readonly ArchiveBaseRoute[],
): readonly FeedRoute[] {
  const routes: FeedRoute[] = [];
  // Two archives can share a route. The router answers the first; keeping the
  // first claim does the same, where handing both to `registerPublicRoute`
  // would fail the boot with an error naming this plugin as its own rival.
  const claimed = new Set<string>();
  for (const { archive, pattern } of baseRoutes) {
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

interface CompiledFeedRoutes {
  /** The archive each feed path this plugin registered belongs to, RSS and Atom. */
  readonly owners: ReadonlyMap<string, string>;
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
    const baseRoutes = archiveBaseRoutes(plugins);
    routes = {
      owners: new Map(
        feedRoutesOver(plugins, baseRoutes).flatMap((route) => {
          const key = archiveKey(route.archive);
          return [
            [route.path, key],
            [`${route.path}/atom`, key],
          ] as const;
        }),
      ),
      laterPages: baseRoutes.map((route) => ({
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
 * Whether a concrete RSS or Atom path serves this archive's feed. Not where
 * the archive has no feed, where the site routes no public type, where the
 * path's listing is a later page of the archive, or where the public route
 * core's dispatcher answers the path with is not this archive's feed — that
 * route's handler is the one that runs, and it cannot serve one archive's
 * entries under another's caching, or be another plugin's response.
 *
 * Runs no query, so a page can ask it to decide what to advertise.
 */
export function servesFeed(
  plugins: PluginRegistry,
  archive: EntryArchive,
  feedPath: string,
): boolean {
  if (publicEntryRows(plugins) === null || !hasFeed(plugins, archive)) {
    return false;
  }
  const key = archiveKey(archive);
  const listing = listingOf(feedPath);
  const { owners, laterPages } = compiledFor(plugins);
  const isLaterPage = laterPages.some(
    (route) =>
      route.archive === key && route.pattern.test({ pathname: listing }),
  );
  if (isLaterPage) return false;
  const answered = publicRouteAt(plugins, feedPath);
  return answered !== null && owners.get(answered.route.path) === key;
}

// The listing a concrete RSS or Atom path hangs off.
function listingOf(feedPath: string): string {
  return feedPath.replace(/\/feed(\/atom)?$/, "") || "/";
}

/**
 * The archive whose feed a concrete RSS or Atom path serves, as core's archive
 * lookup answers for the listing the feed hangs off, or `null` — a 404 — where
 * that archive does not serve a feed there ({@link servesFeed}).
 *
 * Building the answer runs no query: a term or author the archive's query
 * names is looked up when the feed is served.
 */
export function feedAt(
  reader: ArchiveReader,
  feedPath: string,
): ArchiveAtPath | null {
  const found = archiveAtPath(reader, listingOf(feedPath));
  if (found === null) return null;
  return servesFeed(reader.plugins, found.archive, feedPath) ? found : null;
}
