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

/**
 * A short human label for a rule — its tier, or (for a targeted rule) the type
 * plus any `:slug` / `#id` narrowing. Used by the debug bar and as the
 * normalize-error slot name.
 */
export function ruleLabel(rule: TemplateRule): string {
  if (rule.tier !== undefined) return rule.tier;
  const m = rule.match;
  if (m === undefined) return "?";
  let sel = "";
  if (m.slug !== undefined) sel = `:${m.slug}`;
  else if (m.id !== undefined) sel = `#${m.id}`;
  const prefix = m.nodeKind === "content-type-archive" ? "archive:" : "";
  return `${prefix}${m.type}${sel}`;
}

/** What happened to a rule during resolution. */
type ResolutionStatus = "matched" | "skipped" | "never-evaluated";

export interface ResolutionStep {
  readonly label: string;
  readonly status: ResolutionStatus;
  /**
   * Present for a targeted rule carrying a `whereMeta`/`where`/`named`
   * predicate. `fired` is whether the predicate function actually ran (its
   * rule's identity matched and `data` was present); `result` is its return.
   */
  readonly predicate?: { readonly fired: boolean; readonly result: boolean };
}

export interface ResolutionTrace {
  readonly steps: readonly ResolutionStep[];
  /** The winning rule's label, or `null` when nothing matched (a 404). */
  readonly winner: string | null;
}

/**
 * Replay `resolveTemplate` and classify every rule for the debug bar: which one
 * won, which targeted rules were evaluated-but-skipped (with their predicate
 * result), and which were never reached because an earlier zone already won.
 * Dev-only — `resolveTemplate` stays allocation-free on the render hot path.
 */
export function explainTemplateResolution(
  rules: readonly TemplateRule[],
  node: ResolvedNode,
  data?: TemplateData,
): ResolutionTrace {
  const winner = resolveTemplate(rules, node, data);
  // The targeted walk stops at the first matching targeted rule. If the winner
  // is targeted, only rules up to it were evaluated; otherwise every targeted
  // rule was tried and skipped.
  const winnerIsTargeted = winner?.match !== undefined;
  const winnerIndex = winner ? rules.indexOf(winner) : -1;

  const steps = rules.map((rule, index): ResolutionStep => {
    const label = ruleLabel(rule);
    let status: ResolutionStatus;
    if (rule === winner) {
      status = "matched";
    } else if (rule.match !== undefined) {
      const evaluated = !winnerIsTargeted || index < winnerIndex;
      status = evaluated ? "skipped" : "never-evaluated";
    } else {
      status = "never-evaluated";
    }

    const match = rule.match;
    if (match?.predicate !== undefined && status !== "never-evaluated") {
      // A predicate only runs after identity matches and when data is present.
      if (data !== undefined && matchesIdentity(match, node)) {
        return {
          label,
          status,
          predicate: { fired: true, result: match.predicate(data) },
        };
      }
      return { label, status, predicate: { fired: false, result: false } };
    }
    return { label, status };
  });

  return { steps, winner: winner ? ruleLabel(winner) : null };
}
