import type {
  PluginRegistry,
  RegisteredEntryType,
  RegisteredTermTaxonomy,
} from "../plugin/manifest.js";
import type { RouteIntent, RouteRule } from "./intent.js";

const AUTO_ROUTE_PRIORITY = 50;
export const DEFAULT_REWRITE_RULE_PRIORITY = 10;

interface CompiledRule extends RouteRule {
  readonly registeredBy: string | null;
}

/**
 * Compile the route map from the plugin registry. Auto-generates single +
 * archive rules for each public post type, appends explicit
 * `registerRewriteRule` entries, sorts ascending by priority. Identical raw
 * patterns throw — the error names both offending plugins.
 */
export function compileRouteMap(
  registry: PluginRegistry,
): readonly RouteRule[] {
  const rules: CompiledRule[] = [];

  // Taxonomies emit before entry types so that a slug collision (e.g. a
  // post type with `rewrite.slug: 'category'` shadowing a `category`
  // taxonomy) resolves taxonomy-first under the stable-sort tie-break.
  // WP-faithful: `\$wp_rewrite->rules` orders taxonomy archives ahead of
  // post-type singles.
  for (const taxonomy of registry.termTaxonomies.values()) {
    if (taxonomy.isPublic === false) continue;
    for (const rule of autoRulesForTermTaxonomy(taxonomy)) rules.push(rule);
  }

  for (const entryType of registry.entryTypes.values()) {
    if (entryType.isPublic === false) continue;
    for (const rule of autoRulesForEntryType(entryType)) rules.push(rule);
  }

  for (const registered of registry.rewriteRules) {
    rules.push({
      pattern: new URLPattern({ pathname: registered.pattern }),
      rawPattern: registered.pattern,
      intent: registered.intent,
      priority: registered.priority,
      registeredBy: registered.registeredBy,
    });
  }

  assertUniquePatterns(rules);
  rules.sort((a, b) => a.priority - b.priority);
  return rules;
}

function autoRulesForEntryType(entryType: RegisteredEntryType): CompiledRule[] {
  const baseSlug = entryType.rewrite?.slug ?? entryType.name;
  const archiveSlug = archiveSlugFor(entryType, baseSlug);
  const rules: CompiledRule[] = [];

  if (archiveSlug !== null) {
    const basePattern = `/${archiveSlug}`;
    const paginatedPattern = `${basePattern}/page/:page`;
    const intent: RouteIntent = {
      kind: "archive",
      entryType: entryType.name,
    };
    // Paginated variant goes first so /shop/page/2 doesn't accidentally
    // match the bare archive's URLPattern (it wouldn't today, but keep
    // the more-specific rule earlier as a defensive ordering invariant).
    rules.push({
      pattern: new URLPattern({ pathname: paginatedPattern }),
      rawPattern: paginatedPattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: entryType.registeredBy,
    });
    rules.push({
      pattern: new URLPattern({ pathname: basePattern }),
      rawPattern: basePattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: entryType.registeredBy,
    });
  }

  // Hierarchical entry types match nested URLs like /about/team/leadership
  // via URLPattern's `:path+` catch-all. Plugins can opt out per-type
  // (rewrite.isHierarchical: false), which keeps the flat `:slug` pattern
  // even when the data is hierarchical — same opt-out semantics
  // `buildEntryPermalink` honors via `shouldNestUnderEntryParent`.
  const capture = exposesHierarchicalUrls(entryType) ? ":path+" : ":slug";
  const singlePattern =
    baseSlug === "" ? `/${capture}` : `/${baseSlug}/${capture}`;
  rules.push({
    pattern: new URLPattern({ pathname: singlePattern }),
    rawPattern: singlePattern,
    intent: { kind: "single", entryType: entryType.name },
    priority: AUTO_ROUTE_PRIORITY,
    registeredBy: entryType.registeredBy,
  });

  return rules;
}

/**
 * True when a registered entry type or taxonomy exposes nested URLs via
 * `:path+`. `isHierarchical: true` is the data flag (the tree exists);
 * `rewrite.isHierarchical: false` opts URLs back to the flat single-
 * segment pattern even when the data is hierarchical — same opt-out the
 * outbound permalink helpers honor.
 */
function exposesHierarchicalUrls(spec: {
  readonly isHierarchical?: boolean;
  readonly rewrite?: { readonly isHierarchical?: boolean };
}): boolean {
  if (spec.isHierarchical !== true) return false;
  return spec.rewrite?.isHierarchical !== false;
}

function autoRulesForTermTaxonomy(
  taxonomy: RegisteredTermTaxonomy,
): CompiledRule[] {
  const baseSlug = taxonomy.rewrite?.slug ?? taxonomy.name;
  // Mirror the entry-type branch: hierarchical taxonomies expose nested
  // term URLs via `:path+` (e.g. /region/europe/france); the
  // rewrite.isHierarchical:false override keeps the flat `:term` shape
  // even when the term tree itself is hierarchical.
  const capture = exposesHierarchicalUrls(taxonomy) ? ":path+" : ":term";
  const basePattern = `/${baseSlug}/${capture}`;
  const paginatedPattern = `${basePattern}/page/:page`;
  const intent: RouteIntent = { kind: "taxonomy", taxonomy: taxonomy.name };
  return [
    {
      pattern: new URLPattern({ pathname: paginatedPattern }),
      rawPattern: paginatedPattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: taxonomy.registeredBy,
    },
    {
      pattern: new URLPattern({ pathname: basePattern }),
      rawPattern: basePattern,
      intent,
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: taxonomy.registeredBy,
    },
  ];
}

// Archive slugs need to be a single path segment — slashes would let a
// plugin silently shadow other routes. Empty is reserved (would match
// `front-page`).
const ARCHIVE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function archiveSlugFor(
  entryType: RegisteredEntryType,
  baseSlug: string,
): string | null {
  const { hasArchive } = entryType;
  if (!hasArchive) return null;
  if (typeof hasArchive === "string") {
    if (!ARCHIVE_SLUG_RE.test(hasArchive)) {
      throw new Error(
        `Entry type "${entryType.name}" has invalid hasArchive "${hasArchive}" — ` +
          `expected a single lowercase kebab-case path segment.`,
      );
    }
    return hasArchive;
  }
  if (baseSlug === "") return null;
  return baseSlug;
}

function assertUniquePatterns(rules: readonly CompiledRule[]): void {
  const first = new Map<string, string | null>();
  for (const rule of rules) {
    const existing = first.get(rule.rawPattern);
    if (existing !== undefined) {
      throw new Error(
        `Rewrite rule "${rule.rawPattern}" is registered twice ` +
          `(by ${formatOwner(existing)} and ${formatOwner(rule.registeredBy)}).`,
      );
    }
    first.set(rule.rawPattern, rule.registeredBy);
  }
}

function formatOwner(plugin: string | null): string {
  return plugin === null ? "core" : `plugin "${plugin}"`;
}
