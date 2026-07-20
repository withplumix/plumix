/**
 * The WordPress template hierarchy, ported to a typed React world.
 *
 * `getPossibleTemplates(node)` is a pure function returning the ordered
 * candidate template names a theme can register for a given resolved
 * request. The render pipeline walks this list greedy-first-match
 * against the registered template map.
 *
 * Mirrors WordPress's hierarchy verbatim — including the `category-…` /
 * `tag-…` aliases for the built-in taxonomies (a hard-coded WP rule that
 * predates the generic `taxonomy-{tax}-…` chain) and the fall-through to
 * `archive` / `index`. Faust.js exposes the same shape from
 * `getTemplate.ts`; the two implementations should produce identical
 * candidate lists for the same input.
 *
 * `resolveTemplateCandidates(node, hooks)` is the async orchestrator the
 * renderer calls: it runs the pure walker, then applies the
 * `template:hierarchy` filter chain so plugins can mutate the list.
 */

import type { HookExecutor } from "../../hooks/registry.js";
import type {
  GenericTier,
  TargetMatcher,
  TemplateData,
  TemplateRule,
} from "../../theme.js";

declare module "../../hooks/types.js" {
  interface FilterRegistry {
    "template:hierarchy": (
      candidates: readonly string[],
      ctx: { readonly node: ResolvedNode },
    ) => readonly string[] | Promise<readonly string[]>;
  }
}

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

export function getPossibleTemplates(node: ResolvedNode): readonly string[] {
  const candidates: string[] = [];
  switch (node.kind) {
    case "term":
      appendTermNodeCandidates(node, candidates);
      break;
    case "content":
      appendContentNodeCandidates(node, candidates);
      break;
    case "content-type-archive":
      candidates.push(`archive-${node.entryType}`, "archive");
      break;
    case "front-page":
      candidates.push("front-page", "home");
      break;
    case "posts-page":
      candidates.push("home");
      break;
    case "search":
      candidates.push("search");
      break;
  }
  candidates.push("index");
  return candidates;
}

/**
 * The async orchestrator the renderer calls: runs the pure walker, then
 * applies the `template:hierarchy` filter chain. Kept separate from the
 * pure walker so unit tests don't need a HookRegistry to exercise the
 * branching logic.
 */
export async function resolveTemplateCandidates(
  node: ResolvedNode,
  hooks: HookExecutor,
): Promise<readonly string[]> {
  const initial = getPossibleTemplates(node);
  return hooks.applyFilter("template:hierarchy", initial, { node });
}

function appendTermNodeCandidates(node: ResolvedTermNode, out: string[]): void {
  // Built-in taxonomies retain their WP-historical aliases. New taxonomies
  // (registered via `registerTermTaxonomy('region', …)`) flow through the
  // generic `taxonomy-{tax}-…` chain below.
  if (node.taxonomy === "category" || node.taxonomy === "tag") {
    out.push(`${node.taxonomy}-${node.slug}`);
    out.push(`${node.taxonomy}-${node.databaseId}`);
    out.push(node.taxonomy);
  } else {
    out.push(`taxonomy-${node.taxonomy}-${node.slug}`);
    out.push(`taxonomy-${node.taxonomy}-${node.databaseId}`);
    out.push(`taxonomy-${node.taxonomy}`);
    out.push("taxonomy");
  }
  out.push("archive");
}

function appendContentNodeCandidates(
  node: ResolvedContentNode,
  out: string[],
): void {
  // `page` short-circuits the `single` chain — page-{slug}, page-{id}, page,
  // then singular. Every other entry type (post + custom CPTs) walks the
  // full single-* chain.
  if (node.entryType === "page") {
    out.push(`page-${node.slug}`);
    out.push(`page-${node.databaseId}`);
    out.push("page");
  } else {
    out.push(`single-${node.entryType}-${node.slug}`);
    out.push(`single-${node.entryType}`);
    out.push("single");
  }
  out.push("singular");
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
