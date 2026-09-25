import type { AppContext } from "../context/app.js";
import type { EntryQuery } from "../entries/query.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { RouteIntent, RouteRule } from "./intent.js";
import {
  listedEntryTypeNames,
  termPageEntryTypeNames,
} from "../plugin/registry.js";
import { compileRouteMap, FRAMEWORK_PAGINATION_SUFFIX } from "./compile.js";
import { matchRoute } from "./match.js";
import { publicEntriesQuery } from "./render/entry-listing.js";

/**
 * An archive described by an entry query, named by the route intent that
 * reaches it: one of core's built-in listings, or a plugin archive. Search is
 * not one — its results are a match, not a set — and neither is a plugin
 * archive that declared no `entries`.
 */
export type EntryArchive = Exclude<
  RouteIntent,
  { readonly kind: "single" | "search" }
>;

declare module "../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Narrow an archive's entries. Handed the archive's query, which archive
     * it is, and what its URL captured, and runs wherever the query is read —
     * so the archive's page and its feed change together. A query only
     * narrows, and the public-entries rule is applied again when it compiles,
     * so a handler can hide an entry but never reveal one. Synchronous: the
     * query records intent, and asking for it must not cost a round-trip.
     */
    "archive:entries": (
      query: EntryQuery,
      archive: EntryArchive,
      params: Record<string, string>,
    ) => EntryQuery;
  }
}

/** What reading an archive's query needs: its definition, and its narrowings. */
export type ArchiveReader = Pick<AppContext, "plugins" | "hooks">;

/**
 * The front page: public entries of every non-hierarchical type. The author
 * and date archives narrow it, because all three are a stream of posts — a
 * standalone page leaves them, and their feeds with them.
 */
function frontPageEntries(plugins: PluginRegistry): EntryQuery {
  return publicEntriesQuery(plugins).ofTypes(...listedEntryTypeNames(plugins));
}

/** An entry type's archive: its public entries, hierarchical or not. */
function entryTypeEntries(
  plugins: PluginRegistry,
  entryType: string,
): EntryQuery {
  return publicEntriesQuery(plugins).ofTypes(entryType);
}

/**
 * A term's archive: public entries attached to the term. `ofTypes` names the
 * types the page is tagged under, and the public-entries rule it narrows
 * leaves out any of them that is not public.
 */
function termEntries(
  plugins: PluginRegistry,
  taxonomy: string,
  path: readonly string[],
): EntryQuery {
  return publicEntriesQuery(plugins)
    .ofTypes(...termPageEntryTypeNames(plugins, taxonomy))
    .inTerm(taxonomy, path);
}

/** An author's archive: their public entries of non-hierarchical types. */
function authorEntries(plugins: PluginRegistry, slug: string): EntryQuery {
  return frontPageEntries(plugins).byAuthor(slug);
}

/** A date archive: public entries of non-hierarchical types in the period. */
function dateEntries(
  plugins: PluginRegistry,
  year: number,
  month: number | null,
  day: number | null,
): EntryQuery {
  return frontPageEntries(plugins).inDateRange(year, month, day);
}

/**
 * The entry query of the archive at these route params, run through the
 * `archive:entries` filter, or `null` where the params place no archive: a
 * term or author capture that is missing, or a plugin archive that has no
 * `entries` or declined the params. The archive's page and
 * {@link archiveAtPath} both ask this, so they cannot disagree.
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
    case "front-page":
      return frontPageEntries(plugins);
    case "archive":
      return entryTypeEntries(plugins, archive.entryType);
    case "taxonomy": {
      const path = termPathParam(params);
      return path === null
        ? null
        : termEntries(plugins, archive.taxonomy, path);
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
    case "custom": {
      const registered = plugins.archiveTypes.get(archive.name);
      if (registered?.entries === undefined) return null;
      return registered.entries(publicEntriesQuery(plugins), params);
    }
  }
}

/**
 * The term segments a taxonomy route captured: `:path+` where the taxonomy
 * exposes nested URLs, `:term` where they are flat.
 */
export function termPathParam(
  params: Record<string, string>,
): readonly string[] | null {
  if (params.path !== undefined && params.path !== "") {
    return params.path.split("/");
  }
  if (params.term !== undefined && params.term !== "") return [params.term];
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

// The router's own table, compiled once per registry: the lookup has to agree
// with what the dispatcher matched, down to which of two rival patterns wins.
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
  if (intent.kind === "single" || intent.kind === "search") return false;
  return (
    intent.kind !== "custom" ||
    plugins.archiveTypes.get(intent.name)?.entries !== undefined
  );
}

// The front page's first page is the site root, which the dispatcher answers
// when no rule matches rather than through a rule of its own.
const FRONT_PAGE_ROOT = "/";

/**
 * Which archive owns this path, and what its entry query is — for a package
 * that needs an archive's set without rendering its page. The path is a
 * pathname as the router reads it, with no base path, and redirects are not
 * consulted — a path a redirect answers first is still matched. `null` for anything
 * that is not an entry-query archive: a single entry, the search page, a
 * plugin archive without `entries`, a path no route answers, and params the
 * archive declines.
 *
 * Building the query costs nothing: a term or an author it names is looked up
 * when the query is compiled, not here. So a query can still fail to resolve
 * — a term or author nobody holds, a date that does not exist — where the
 * archive's page answers 404.
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
      ? archiveWithQuery(reader, { kind: "front-page" }, {})
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
 * Every route an entry-query archive is listed at, without its later pages,
 * in the order the router matches them — so another package can put something
 * beside each archive (a feed at `<route>/feed`) and have it follow the
 * archive wherever the permalink configuration moved it.
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
    routes.push({ archive: { kind: "front-page" }, pattern: FRONT_PAGE_ROOT });
  }
  return routes;
}
