import type {
  PluginRegistry,
  RegisteredArchiveType,
  RegisteredEntryType,
  RegisteredTermTaxonomy,
} from "../plugin/manifest.js";
import type { RouteIntent, RouteRule } from "./contract/intent.js";
import type { RegistrationKind } from "./errors.js";
import { baseSlugProblem } from "./base-slug.js";
import { RouteCompileError } from "./errors.js";
import { matchRoute } from "./match.js";

const AUTO_ROUTE_PRIORITY = 50;
export const DEFAULT_REWRITE_RULE_PRIORITY = 10;
// Framework-owned routes sort ahead of explicit rewrites so a plugin's
// catch-all can't shadow `/page/N`.
const FRAMEWORK_ROUTE_PRIORITY = 5;
// Empty-baseSlug single patterns (`/:slug` or `/:path+`) match everything
// at the URL root, so they sort after sibling-plugin auto rules to keep
// resolution order-independent.
const CATCH_ALL_ROUTE_PRIORITY = 60;

/**
 * The tail every paginated route ends in, core's own and a plugin archive's
 * alike, so a consumer can tell a listing's later pages from its first.
 */
export const FRAMEWORK_PAGINATION_SUFFIX = "/page/:page(\\d+)";

function isPaginatedRoute(route: string): boolean {
  return route.endsWith(FRAMEWORK_PAGINATION_SUFFIX);
}

// One array per archive, so a consumer that compiles the list into patterns
// can cache on its identity the way it does for a `routes` it was handed.
const derivedRoutes = new WeakMap<RegisteredArchiveType, readonly string[]>();

/**
 * Every pathname an archive dispatches at, including the `/page/:page` forms
 * core derives when it declares `entries`. Ask this rather than reading
 * `routes`.
 */
export function archiveRoutes(
  archive: RegisteredArchiveType,
): readonly string[] {
  if (archive.entries === undefined) return archive.routes;
  const cached = derivedRoutes.get(archive);
  if (cached !== undefined) return cached;
  const derived = archive.routes
    .filter((route) => !isPaginatedRoute(route))
    .map((route) => `${route}${FRAMEWORK_PAGINATION_SUFFIX}`);
  // A plugin that declared a later-page route as well as `entries` keeps one
  // rule, not two identical patterns the compiler would reject as rivals.
  const routes = [...new Set([...archive.routes, ...derived])];
  derivedRoutes.set(archive, routes);
  return routes;
}

export const FRAMEWORK_SEARCH_BARE_PATTERN = "/search";
export const FRAMEWORK_SEARCH_QUERY_PATTERN = "/search/:query";
export const FRAMEWORK_SEARCH_PAGINATED_PATTERN = `${FRAMEWORK_SEARCH_QUERY_PATTERN}${FRAMEWORK_PAGINATION_SUFFIX}`;
export const FRAMEWORK_AUTHOR_PATTERN = "/authors/:slug";
export const FRAMEWORK_AUTHOR_PAGINATED_PATTERN = `${FRAMEWORK_AUTHOR_PATTERN}${FRAMEWORK_PAGINATION_SUFFIX}`;

// These sort at framework priority, so `/2026` shadows a post slugged "2026"
// (as WP reserves date URLs) unless the site turns `routes.date` off.
const YEAR = ":year(\\d{4})";
const MONTH = ":month(\\d{2})";
const DAY = ":day(\\d{2})";
export const FRAMEWORK_DATE_YEAR_PATTERN = `/${YEAR}`;
export const FRAMEWORK_DATE_MONTH_PATTERN = `/${YEAR}/${MONTH}`;
export const FRAMEWORK_DATE_DAY_PATTERN = `/${YEAR}/${MONTH}/${DAY}`;
export const FRAMEWORK_DATE_YEAR_PAGINATED_PATTERN = `/${YEAR}${FRAMEWORK_PAGINATION_SUFFIX}`;
export const FRAMEWORK_DATE_MONTH_PAGINATED_PATTERN = `/${YEAR}/${MONTH}${FRAMEWORK_PAGINATION_SUFFIX}`;
export const FRAMEWORK_DATE_DAY_PAGINATED_PATTERN = `/${YEAR}/${MONTH}/${DAY}${FRAMEWORK_PAGINATION_SUFFIX}`;

interface CompiledRule extends RouteRule {
  readonly registeredBy: string | null;
  // Set on auto rules, whose URLs core emits as permalinks: raised when a
  // framework rule answers them first.
  readonly onFrameworkCapture?: (frameworkPattern: string) => RouteCompileError;
}

/**
 * Compile the registry's route map, sorted ascending by priority. Throws when
 * two owners claim the same raw pattern.
 */
export function compileRouteMap(
  registry: PluginRegistry,
): readonly RouteRule[] {
  const { frameworkRoutes } = registry;
  const rules: CompiledRule[] = [
    // `(\d+)` lets a hierarchical pages plugin keep `/page/:path+`.
    // The front page's later pages: the pagination suffix under the root.
    ...frameworkRules({ kind: "frontPage" }, [FRAMEWORK_PAGINATION_SUFFIX]),
    // A family the site turned off is never compiled, leaving its URLs free.
    // Paginated first: URLPattern would otherwise capture `foo/page/2` as
    // `:query`.
    ...(frameworkRoutes.search
      ? frameworkRules({ kind: "search" }, [
          FRAMEWORK_SEARCH_PAGINATED_PATTERN,
          FRAMEWORK_SEARCH_QUERY_PATTERN,
          FRAMEWORK_SEARCH_BARE_PATTERN,
        ])
      : []),
    // Paginated variant first, mirroring search — keeps the more-specific rule
    // ahead of the bare `/authors/:slug`.
    ...(frameworkRoutes.author
      ? frameworkRules({ kind: "author" }, [
          FRAMEWORK_AUTHOR_PAGINATED_PATTERN,
          FRAMEWORK_AUTHOR_PATTERN,
        ])
      : []),
    // Date archives, most-specific first (day → month → year, paginated before
    // bare) so a more-granular URL is never captured by a coarser rule.
    ...(frameworkRoutes.date
      ? frameworkRules({ kind: "date" }, [
          FRAMEWORK_DATE_DAY_PAGINATED_PATTERN,
          FRAMEWORK_DATE_DAY_PATTERN,
          FRAMEWORK_DATE_MONTH_PAGINATED_PATTERN,
          FRAMEWORK_DATE_MONTH_PATTERN,
          FRAMEWORK_DATE_YEAR_PAGINATED_PATTERN,
          FRAMEWORK_DATE_YEAR_PATTERN,
        ])
      : []),
  ];

  // Taxonomies emit first so a slug collision resolves taxonomy-first under the
  // stable sort, as WP orders taxonomy archives ahead of post-type singles.
  for (const taxonomy of registry.termTaxonomies.values()) {
    if (!taxonomy.isPublic) continue;
    for (const rule of autoRulesForTermTaxonomy(taxonomy)) rules.push(rule);
  }

  for (const entryType of registry.entryTypes.values()) {
    if (!entryType.isPublic) continue;
    for (const rule of autoRulesForEntryType(entryType)) rules.push(rule);
  }

  for (const registered of registry.rewriteRules) {
    rules.push({
      pattern: new URLPattern({ pathname: registered.pattern }),
      rawPattern: registered.pattern,
      intent: registered.intent,
      priority: registered.priority,
      registeredBy: registered.registeredBy,
      isPermalinkRoute: false,
    });
  }

  // Plugin-registered archive types (`registerArchiveType`): each route becomes
  // a rule carrying the `archiveType` intent that `resolvePublicRoute` looks
  // the resolver up by. Default to the rewrite-rule priority.
  for (const archive of registry.archiveTypes.values()) {
    // Later pages first, as the auto rules order them: a multi-segment capture
    // in the listing route (`/docs/:path+`) would otherwise swallow `/page/2`.
    const routes = archiveRoutes(archive);
    const paginatedFirst = [
      ...routes.filter(isPaginatedRoute),
      ...routes.filter((route) => !isPaginatedRoute(route)),
    ];
    for (const rawPattern of paginatedFirst) {
      rules.push({
        pattern: new URLPattern({ pathname: rawPattern }),
        rawPattern,
        intent: { kind: "archiveType", name: archive.name },
        priority: archive.priority ?? DEFAULT_REWRITE_RULE_PRIORITY,
        registeredBy: archive.registeredBy,
        isPermalinkRoute: false,
      });
    }
  }

  // Plugin-registered views (`registerView`): a per-visitor app page lists
  // nothing, so its routes are taken as written — no derived `/page/:page`.
  for (const view of registry.views.values()) {
    for (const rawPattern of view.routes) {
      rules.push({
        pattern: new URLPattern({ pathname: rawPattern }),
        rawPattern,
        intent: { kind: "view", name: view.name },
        priority: DEFAULT_REWRITE_RULE_PRIORITY,
        registeredBy: view.registeredBy,
        isPermalinkRoute: false,
      });
    }
  }

  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  // Ahead of the duplicate check: an auto archive at `/search` is also a
  // duplicate pattern, and this error names the registration and its slug.
  assertAutoUrlsResolveToThemselves(sorted);
  assertUniquePatterns(rules);
  return sorted;
}

function frameworkRules(
  intent: RouteIntent,
  rawPatterns: readonly string[],
): CompiledRule[] {
  return rawPatterns.map((rawPattern) => ({
    pattern: new URLPattern({ pathname: rawPattern }),
    rawPattern,
    intent,
    priority: FRAMEWORK_ROUTE_PRIORITY,
    registeredBy: null,
    isPermalinkRoute: true,
  }));
}

/** The slug this type's archive is routed at, or null where it has none. */
export function archiveSlugForEntryType(
  entryType: RegisteredEntryType,
): string | null {
  return archiveSlugFor(entryType, baseSlugFor(entryType, "entry_type"));
}

function autoRulesForEntryType(entryType: RegisteredEntryType): CompiledRule[] {
  const baseSlug = baseSlugFor(entryType, "entry_type");
  const archiveSlug = archiveSlugForEntryType(entryType);
  const rules: CompiledRule[] = [];

  if (archiveSlug !== null) {
    const basePattern = `/${archiveSlug}`;
    const paginatedPattern = `${basePattern}${FRAMEWORK_PAGINATION_SUFFIX}`;
    const intent: RouteIntent = {
      kind: "entryType",
      entryType: entryType.name,
    };
    const { hasArchive } = entryType;
    const onFrameworkCapture =
      typeof hasArchive === "string"
        ? (rawPattern: string) =>
            RouteCompileError.invalidArchiveSlug({
              entryType: entryType.name,
              hasArchive,
              rawPattern,
            })
        : rewriteSlugCapture(entryType, "entry_type", baseSlug);
    // Paginated variant goes first so /shop/page/2 doesn't accidentally
    // match the bare archive's URLPattern (it wouldn't today, but keep
    // the more-specific rule earlier as a defensive ordering invariant).
    rules.push({
      pattern: new URLPattern({ pathname: paginatedPattern }),
      rawPattern: paginatedPattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: entryType.registeredBy,
      isPermalinkRoute: true,
      onFrameworkCapture,
    });
    rules.push({
      pattern: new URLPattern({ pathname: basePattern }),
      rawPattern: basePattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: entryType.registeredBy,
      isPermalinkRoute: true,
      onFrameworkCapture,
    });
  }

  const capture = exposesHierarchicalUrls(entryType) ? ":path+" : ":slug";
  const singlePattern =
    baseSlug === "" ? `/${capture}` : `/${baseSlug}/${capture}`;
  rules.push({
    pattern: new URLPattern({ pathname: singlePattern }),
    rawPattern: singlePattern,
    intent: { kind: "entry", entryType: entryType.name },
    priority: baseSlug === "" ? CATCH_ALL_ROUTE_PRIORITY : AUTO_ROUTE_PRIORITY,
    registeredBy: entryType.registeredBy,
    isPermalinkRoute: true,
    onFrameworkCapture: rewriteSlugCapture(entryType, "entry_type", baseSlug),
  });

  return rules;
}

/**
 * Whether nested `:path+` URLs are exposed: `rewrite.isHierarchical: false`
 * keeps flat URLs over hierarchical data. Outbound permalink helpers ask this
 * so their URLs match the compiled shape.
 */
export function exposesHierarchicalUrls(spec: {
  readonly isHierarchical?: boolean;
  readonly rewrite?: { readonly isHierarchical?: boolean };
}): boolean {
  if (spec.isHierarchical !== true) return false;
  return spec.rewrite?.isHierarchical !== false;
}

function autoRulesForTermTaxonomy(
  taxonomy: RegisteredTermTaxonomy,
): CompiledRule[] {
  const baseSlug = baseSlugFor(taxonomy, "term_taxonomy");
  // Mirror the entry-type branch: hierarchical taxonomies expose nested
  // term URLs via `:path+` (e.g. /region/europe/france); the
  // rewrite.isHierarchical:false override keeps the flat `:term` shape
  // even when the term tree itself is hierarchical.
  const capture = exposesHierarchicalUrls(taxonomy) ? ":path+" : ":term";
  const basePattern = `/${baseSlug}/${capture}`;
  const paginatedPattern = `${basePattern}${FRAMEWORK_PAGINATION_SUFFIX}`;
  const intent: RouteIntent = { kind: "term", taxonomy: taxonomy.name };
  const onFrameworkCapture = rewriteSlugCapture(
    taxonomy,
    "term_taxonomy",
    baseSlug,
  );
  return [
    {
      pattern: new URLPattern({ pathname: paginatedPattern }),
      rawPattern: paginatedPattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: taxonomy.registeredBy,
      isPermalinkRoute: true,
      onFrameworkCapture,
    },
    {
      pattern: new URLPattern({ pathname: basePattern }),
      rawPattern: basePattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: taxonomy.registeredBy,
      isPermalinkRoute: true,
      onFrameworkCapture,
    },
  ];
}

// URL-pattern syntax in a slug would widen the rule into a catch-all. `""` is
// allowed only for entry types (root mount); a taxonomy would compile
// `//:term`.
function baseSlugFor(
  spec: RegisteredEntryType | RegisteredTermTaxonomy,
  registration: RegistrationKind,
): string {
  const slug = spec.rewrite?.slug;
  if (slug === undefined) return spec.name;
  if (slug === "" && registration === "entry_type") return slug;
  if (baseSlugProblem(slug) !== null) {
    throw RouteCompileError.invalidRewriteSlug({
      registration,
      registrationName: spec.name,
      rewriteSlug: slug,
    });
  }
  return slug;
}

function rewriteSlugCapture(
  spec: RegisteredEntryType | RegisteredTermTaxonomy,
  registration: RegistrationKind,
  baseSlug: string,
): (frameworkPattern: string) => RouteCompileError {
  return (rawPattern) =>
    RouteCompileError.invalidRewriteSlug({
      registration,
      registrationName: spec.name,
      rewriteSlug: baseSlug,
      rawPattern,
    });
}

function archiveSlugFor(
  entryType: RegisteredEntryType,
  baseSlug: string,
): string | null {
  const { hasArchive } = entryType;
  if (!hasArchive) return null;
  // No empty branch here, unlike `baseSlugFor`: an archive at the root would
  // collide with the front page.
  if (typeof hasArchive === "string") {
    if (baseSlugProblem(hasArchive) !== null) {
      throw RouteCompileError.invalidArchiveSlug({
        entryType: entryType.name,
        hasArchive,
      });
    }
    return hasArchive;
  }
  if (baseSlug === "") return null;
  return baseSlug;
}

// A plugin may shadow a framework route at a priority that beats it, and then
// owns the pattern. Runs before the sort, so the framework rule is seen first.
function assertUniquePatterns(rules: readonly CompiledRule[]): void {
  const owner = new Map<string, CompiledRule>();
  for (const rule of rules) {
    const existing = owner.get(rule.rawPattern);
    if (existing !== undefined) {
      const shadowsFramework =
        existing.registeredBy === null && rule.priority < existing.priority;
      if (!shadowsFramework) {
        throw RouteCompileError.duplicateRewriteRule({
          rawPattern: rule.rawPattern,
          firstOwner: existing.registeredBy,
          secondOwner: rule.registeredBy,
        });
      }
    }
    owner.set(rule.rawPattern, rule);
  }
}

// A non-numeric segment, so the probe stays out of the URL space the framework
// reserves on purpose: date archives (`/2026`) and root pagination (`/page/2`).
const SAMPLE_SEGMENT = "sample";
const SAMPLE_PAGE = "2";
const SAMPLE_ORIGIN = "https://sample.invalid";
const CAPTURE_RE = /:(\w+)(?:\([^()]*\))?\+?/g;

function samplePathFor(rawPattern: string): string {
  return rawPattern.replace(CAPTURE_RE, (_, name: string) =>
    name === "page" ? SAMPLE_PAGE : SAMPLE_SEGMENT,
  );
}

// Permalink builders emit auto rules' URLs, so a framework rule answering one
// first misdirects sitemaps and canonicals. Probing sorted rules lets a
// deliberate shadow keep its URLs.
function assertAutoUrlsResolveToThemselves(
  sorted: readonly CompiledRule[],
): void {
  for (const rule of sorted) {
    if (rule.onFrameworkCapture === undefined) continue;
    const match = matchRoute(
      new URL(samplePathFor(rule.rawPattern), SAMPLE_ORIGIN),
      sorted,
    );
    // The first rule with the pattern, not a map keyed on it: a duplicate
    // pattern is still in `sorted` here, and the earlier one is what matched.
    const winner =
      match &&
      sorted.find((candidate) => candidate.rawPattern === match.pattern);
    if (winner?.registeredBy === null) {
      throw rule.onFrameworkCapture(winner.rawPattern);
    }
  }
}
