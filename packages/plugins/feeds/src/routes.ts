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

// An `access`-policied archive gets no feed: core matches public routes ahead
// of the access gate and principal loading, so there is no reader to check.
function hasFeed(plugins: PluginRegistry, archive: EntryArchive): boolean {
  switch (archive.kind) {
    case "entryType":
      return isSyndicatableEntryType(plugins.entryTypes.get(archive.entryType));
    case "archiveType": {
      const registered = plugins.archiveTypes.get(archive.name);
      return registered?.feed !== undefined && registered.access === undefined;
    }
    case "frontPage":
    case "term":
    case "author":
    case "date":
      return true;
  }
}

// One archive's identity, whichever of its routes named it.
function archiveKey(archive: EntryArchive): string {
  switch (archive.kind) {
    case "entryType":
      return `entryType:${archive.entryType}`;
    case "term":
      return `term:${archive.taxonomy}`;
    case "archiveType":
      return `archiveType:${archive.name}`;
    case "frontPage":
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
 * Read from core's archive routes in match order, so a feed follows its
 * archive's permalink and an archive with no page has none.
 */
export function feedRoutes(plugins: PluginRegistry): readonly FeedRoute[] {
  return feedRoutesOver(plugins, archiveBaseRoutes(plugins));
}

function feedRoutesOver(
  plugins: PluginRegistry,
  baseRoutes: readonly ArchiveBaseRoute[],
): readonly FeedRoute[] {
  const routes: FeedRoute[] = [];
  // Two archives can share a route; the router answers the first, and
  // registering both would fail the boot as a duplicate claim.
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
        archive.kind !== "archiveType" ||
        plugins.archiveTypes.get(archive.name)?.cacheable === true,
    });
  }
  return routes;
}

interface CompiledFeedRoutes {
  /**
   * Built from the feed routes, so matching an owner here is also the `hasFeed`
   * check.
   */
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

function servesListing(
  plugins: PluginRegistry,
  key: string,
  listing: string,
): boolean {
  if (publicEntryRows(plugins) === null) return false;
  return !compiledFor(plugins).laterPages.some(
    (route) =>
      route.archive === key && route.pattern.test({ pathname: listing }),
  );
}

/**
 * False when the dispatcher would answer `feedPath` with another route, since
 * that route's handler is the one that runs. Runs no query.
 */
export function servesFeed(
  plugins: PluginRegistry,
  archive: EntryArchive,
  feedPath: string,
): boolean {
  const key = archiveKey(archive);
  if (!servesListing(plugins, key, listingOf(feedPath))) return false;
  const answered = publicRouteAt(plugins, feedPath);
  return (
    answered !== null &&
    compiledFor(plugins).owners.get(answered.route.path) === key
  );
}

// The listing a concrete RSS or Atom path hangs off.
function listingOf(feedPath: string): string {
  return feedPath.replace(/\/feed(\/atom)?$/, "") || "/";
}

/**
 * `null` (a 404) when the listing isn't `route`'s own archive or serves no feed
 * there. Runs no query.
 */
export function feedAt(
  reader: ArchiveReader,
  route: FeedRoute,
  feedPath: string,
): ArchiveAtPath | null {
  const listing = listingOf(feedPath);
  const found = archiveAtPath(reader, listing);
  if (found === null) return null;
  const key = archiveKey(found.archive);
  if (key !== archiveKey(route.archive)) return null;
  return servesListing(reader.plugins, key, listing) ? found : null;
}
