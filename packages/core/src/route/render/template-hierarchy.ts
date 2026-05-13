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
  | ResolvedPostsPage;

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
