/**
 * Template resolution for the array-based `templates`. `resolveTemplate` walks a
 * theme's rules — targeted matchers (`forEntryType`/`forTaxonomy`) in
 * declaration order, then the generic tier for the node's kind, then the
 * universal `fallback`. `resolveErrorTemplate` looks up the 404/500 tiers.
 *
 * The `ResolvedNode` shapes carry the identity the resolver matches on (kind +
 * type + slug/id).
 */

import type {
  GenericTier,
  TargetMatcher,
  TemplateData,
  TemplateRule,
} from "../../theme.js";

export type ResolvedNode =
  | ResolvedTermNode
  | ResolvedContentNode
  | ResolvedContentTypeArchive
  | ResolvedFrontPage
  | ResolvedPostsPage
  | ResolvedSearch;

interface ResolvedTermNode {
  readonly kind: "term";
  readonly taxonomy: string;
  readonly slug: string;
  readonly databaseId: number;
}

interface ResolvedContentNode {
  readonly kind: "content";
  readonly entryType: string;
  readonly slug: string;
  readonly databaseId: number;
}

interface ResolvedContentTypeArchive {
  readonly kind: "content-type-archive";
  readonly entryType: string;
}

interface ResolvedFrontPage {
  readonly kind: "front-page";
}

/**
 * The "posts page" — when a site assigns a page as the blog home in
 * Settings → Reading. Falls through to `home` then `index`. Distinct from
 * `front-page` because the front page may or may not be the posts page.
 */
interface ResolvedPostsPage {
  readonly kind: "posts-page";
}

interface ResolvedSearch {
  readonly kind: "search";
}

// Maps each resolved-node kind to the generic tier that renders it. `fallback`
// (universal) and the `notFound`/`serverError` handlers are not node-matched —
// the former is the terminal, the latter fire on a condition, not a node.
const GENERIC_TIER_FOR_NODE: Record<ResolvedNode["kind"], GenericTier> = {
  content: "entry",
  "content-type-archive": "archive",
  term: "taxonomy",
  "front-page": "frontPage",
  "posts-page": "postsPage",
  search: "search",
};

/**
 * The identity part of a match: node kind + type name, then the optional
 * `slug`/`id` narrowing — an unset selector matches any.
 */
function matchesIdentity(match: TargetMatcher, node: ResolvedNode): boolean {
  if (match.nodeKind !== node.kind) return false;
  switch (node.kind) {
    case "content-type-archive":
      return match.type === node.entryType;
    case "content":
      return (
        match.type === node.entryType &&
        (match.slug === undefined || match.slug === node.slug) &&
        (match.id === undefined || match.id === node.databaseId)
      );
    case "term":
      return (
        match.type === node.taxonomy &&
        (match.slug === undefined || match.slug === node.slug) &&
        (match.id === undefined || match.id === node.databaseId)
      );
    default:
      return false;
  }
}

/**
 * Does a targeted matcher apply? Identity first, then the optional data
 * predicate (`whereMeta`/`where`/`named`) — which needs the resolved data, so a
 * predicate rule never matches when `data` is absent.
 */
function matchesNode(
  match: TargetMatcher,
  node: ResolvedNode,
  data: TemplateData | undefined,
): boolean {
  if (!matchesIdentity(match, node)) return false;
  if (match.predicate === undefined) return true;
  return data !== undefined && match.predicate(data);
}

/**
 * Resolve a node to its template rule from a theme's `templates` array:
 * (1) targeted rules (`forEntryType`/`forTaxonomy`, incl. `whereMeta`/`where`/
 * `named` predicates) in declaration order, first match wins; (2) the generic
 * tier for the node's kind; (3) the universal `fallback`. Returns `undefined`
 * when nothing matches — the caller then renders the `notFound` (404) template.
 * `data` is required for predicate rules to match.
 */
export function resolveTemplate(
  rules: readonly TemplateRule[],
  node: ResolvedNode,
  data?: TemplateData,
): TemplateRule | undefined {
  for (const rule of rules) {
    if (rule.match !== undefined && matchesNode(rule.match, node, data)) {
      return rule;
    }
  }
  const tier = GENERIC_TIER_FOR_NODE[node.kind];
  return (
    rules.find((r) => r.tier === tier) ??
    rules.find((r) => r.tier === "fallback")
  );
}

/**
 * Look up an error-tier template (`notFound` → 404, `serverError` → 500).
 * Separate from `resolveTemplate` because error pages are triggered by a
 * condition (no match, or a render throw), not by a resolved node.
 */
export function resolveErrorTemplate(
  rules: readonly TemplateRule[],
  tier: "notFound" | "serverError",
): TemplateRule | undefined {
  return rules.find((r) => r.tier === tier);
}
