import type { AppContext } from "../context/app-context.js";
import type { EntryQuery } from "../entries/contract/query.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { RouteIntent, RouteRule } from "./contract/intent.js";
import {
  listedEntryTypeNames,
  termPageEntryTypeNames,
} from "../plugin/registry.js";
import { compileRouteMap, FRAMEWORK_PAGINATION_SUFFIX } from "./compile.js";
import { matchRoute } from "./match.js";
import { publicEntriesQuery } from "./render/entry-listing.js";

/**
 * An archive described by an entry query. Search, views, and plugin archives
 * without `entries` are not one.
 */
export type EntryArchive = Exclude<
  RouteIntent,
  { readonly kind: "entry" | "search" | "view" }
>;

declare module "../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Narrow an archive's entries wherever its query is read, so page and feed
     * agree. The public-entries rule reapplies, so a handler can hide an entry
     * but never reveal one.
     */
    "archive:entries": (
      query: EntryQuery,
      archive: EntryArchive,
      params: Record<string, string>,
    ) => EntryQuery;
  }
}

/**
 * What reading an archive's query needs: its definition, and its narrowings.
 */
export type ArchiveReader = Pick<AppContext, "plugins" | "hooks">;

/**
 * Author and date archives narrow this, since all three are a stream of posts.
 */
function frontPageEntries(plugins: PluginRegistry): EntryQuery {
  return publicEntriesQuery(plugins).ofTypes(...listedEntryTypeNames(plugins));
}

function entryTypeEntries(
  plugins: PluginRegistry,
  entryType: string,
): EntryQuery {
  return publicEntriesQuery(plugins).ofTypes(entryType);
}

/** The public-entries rule leaves out any tagged type that is not public. */
function termEntries(
  plugins: PluginRegistry,
  taxonomy: string,
  slug: string,
): EntryQuery {
  return publicEntriesQuery(plugins)
    .ofTypes(...termPageEntryTypeNames(plugins, taxonomy))
    .inTerm(taxonomy, slug);
}

function authorEntries(plugins: PluginRegistry, slug: string): EntryQuery {
  return frontPageEntries(plugins).byAuthor(slug);
}

function dateEntries(
  plugins: PluginRegistry,
  year: number,
  month: number | null,
  day: number | null,
): EntryQuery {
  return frontPageEntries(plugins).inDateRange(year, month, day);
}

/**
 * The archive's entry query after the `archive:entries` filter, or `null`
 * where the params place no archive. Its page and {@link archiveAtPath} share
 * it so they agree.
 */
export function archiveEntries(
  { plugins, hooks }: ArchiveReader,
  archive: EntryArchive,
  params: Record<string, string>,
): EntryQuery | null {
  const query = definedEntries(plugins, archive, params);
  if (query === null) return null;
  return hooks.applyFilterSync("archive:entries", query, archive, params);
}

function definedEntries(
  plugins: PluginRegistry,
  archive: EntryArchive,
  params: Record<string, string>,
): EntryQuery | null {
  switch (archive.kind) {
    case "frontPage":
      return frontPageEntries(plugins);
    case "entryType":
      return entryTypeEntries(plugins, archive.entryType);
    case "term": {
      const slug = termSlugParam(params);
      return slug === null
        ? null
        : termEntries(plugins, archive.taxonomy, slug);
    }
    case "author":
      return params.slug === undefined
        ? null
        : authorEntries(plugins, params.slug);
    case "date":
      return dateEntries(
        plugins,
        Number(params.year),
        params.month === undefined ? null : Number(params.month),
        params.day === undefined ? null : Number(params.day),
      );
    case "archiveType": {
      const registered = plugins.archiveTypes.get(archive.name);
      if (registered?.entries === undefined) return null;
      return registered.entries(publicEntriesQuery(plugins), params);
    }
  }
}

/**
 * The slug of the term a taxonomy route captured. A nested URL's ancestors are
 * decoration: a slug names one term in its taxonomy.
 */
export function termSlugParam(params: Record<string, string>): string | null {
  if (params.path !== undefined && params.path !== "") {
    return params.path.split("/").at(-1) ?? null;
  }
  if (params.term !== undefined && params.term !== "") return params.term;
  return null;
}

/** An archive at a path, and the entry query that describes it. */
export interface ArchiveAtPath {
  readonly archive: EntryArchive;
  readonly params: Record<string, string>;
  readonly entries: EntryQuery;
}

/** One route an archive is listed at, before any `/page/N`. */
export interface ArchiveBaseRoute {
  readonly archive: EntryArchive;
  /** A `URLPattern` pathname, as the router compiled it. */
  readonly pattern: string;
}

/**
 * The router's own table, compiled once per registry: the lookup has to agree
 * with what the dispatcher matched, down to which of two rival patterns wins.
 */
const routeMaps = new WeakMap<PluginRegistry, readonly RouteRule[]>();

function routeMapOf(plugins: PluginRegistry): readonly RouteRule[] {
  let routeMap = routeMaps.get(plugins);
  if (routeMap === undefined) {
    routeMap = compileRouteMap(plugins);
    routeMaps.set(plugins, routeMap);
  }
  return routeMap;
}

function isEntryArchive(
  plugins: PluginRegistry,
  intent: RouteIntent,
): intent is EntryArchive {
  if (
    intent.kind === "entry" ||
    intent.kind === "search" ||
    intent.kind === "view"
  ) {
    return false;
  }
  return (
    intent.kind !== "archiveType" ||
    plugins.archiveTypes.get(intent.name)?.entries !== undefined
  );
}

/**
 * The front page's first page is the site root, which the dispatcher answers
 * when no rule matches rather than through a rule of its own.
 */
const FRONT_PAGE_ROOT = "/";

/**
 * Which entry-query archive owns this pathname (no base path; redirects
 * ignored), and its query. A missing term, author or date fails only when the
 * query compiles.
 */
export function archiveAtPath(
  reader: ArchiveReader,
  pathname: string,
): ArchiveAtPath | null {
  const { plugins } = reader;
  const match = matchRoute(
    new URL(pathname, "https://plumix.invalid"),
    routeMapOf(plugins),
  );
  if (match === null) {
    return pathname === FRONT_PAGE_ROOT
      ? archiveWithQuery(reader, { kind: "frontPage" }, {})
      : null;
  }
  if (!isEntryArchive(plugins, match.intent)) return null;
  return archiveWithQuery(reader, match.intent, match.params);
}

function archiveWithQuery(
  reader: ArchiveReader,
  archive: EntryArchive,
  params: Record<string, string>,
): ArchiveAtPath | null {
  const entries = archiveEntries(reader, archive, params);
  return entries === null ? null : { archive, params, entries };
}

/**
 * Every route an entry-query archive is listed at, excluding later pages, in
 * match order, so a sibling (a feed at `<route>/feed`) follows the archive's
 * permalink configuration.
 */
export function archiveBaseRoutes(
  plugins: PluginRegistry,
): readonly ArchiveBaseRoute[] {
  const routeMap = routeMapOf(plugins);
  const routes: ArchiveBaseRoute[] = [];
  for (const rule of routeMap) {
    if (!isEntryArchive(plugins, rule.intent)) continue;
    if (rule.rawPattern.endsWith(FRAMEWORK_PAGINATION_SUFFIX)) continue;
    routes.push({ archive: rule.intent, pattern: rule.rawPattern });
  }
  // Last, where the dispatcher reaches it: the root is the front page only
  // when no rule answers it first.
  if (
    !routeMap.some((rule) => rule.pattern.test({ pathname: FRONT_PAGE_ROOT }))
  ) {
    routes.push({ archive: { kind: "frontPage" }, pattern: FRONT_PAGE_ROOT });
  }
  return routes;
}
