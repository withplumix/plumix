/**
 * The precedence walk shared by every rule set a theme declares against the
 * node hierarchy. `resolveRule` reads only a rule's generic tier and its
 * targeted matcher, so the payload it carries — a template component, an OG
 * card, whatever a later rule kind adds — never enters the resolution.
 *
 * The `ResolvedNode` shapes carry the identity a matcher matches on (kind +
 * type + slug/id).
 */

import type {
  GenericTier,
  TargetMatcher,
  TemplateData,
  TierMatchRule,
} from "../../theme.js";

export type ResolvedNode =
  | ResolvedTermNode
  | ResolvedContentNode
  | ResolvedContentTypeArchive
  | ResolvedAuthorNode
  | ResolvedDateNode
  | ResolvedCustomNode
  | ResolvedFrontPage
  | ResolvedSearch;

interface ResolvedTermNode {
  readonly kind: "term";
  readonly taxonomy: string;
  readonly slug: string;
  readonly databaseId: number;
}

interface ResolvedAuthorNode {
  readonly kind: "author";
  readonly slug: string;
  readonly databaseId: number;
}

interface ResolvedDateNode {
  readonly kind: "date";
  readonly year: number;
  readonly month: number | null;
  readonly day: number | null;
}

interface ResolvedCustomNode {
  readonly kind: "custom";
  /** The registered archive-type name (`registerArchiveType`). */
  readonly name: string;
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

interface ResolvedSearch {
  readonly kind: "search";
}

// Maps each resolved-node kind to the generic tier that serves it. `fallback`
// (universal) and the `notFound`/`serverError` handlers are not node-matched —
// the former is the terminal, the latter fire on a condition, not a node.
const GENERIC_TIER_FOR_NODE: Record<ResolvedNode["kind"], GenericTier> = {
  content: "entry",
  "content-type-archive": "archive",
  term: "taxonomy",
  author: "author",
  date: "date",
  // Plugin archives have no dedicated generic tier — they match via a
  // `forArchiveType(name)` targeted rule, else the universal `fallback`.
  custom: "fallback",
  "front-page": "frontPage",
  search: "search",
};

/**
 * The identity part of a match: node kind + type name, then the optional
 * `slug`/`id` narrowing — an unset selector matches any.
 */
export function matchesIdentity(
  match: TargetMatcher,
  node: ResolvedNode,
): boolean {
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
    case "author":
      // Author matchers carry a fixed `type` of "author"; identity narrows by
      // slug/id like a term.
      return (
        match.type === "author" &&
        (match.slug === undefined || match.slug === node.slug) &&
        (match.id === undefined || match.id === node.databaseId)
      );
    case "date":
      // Date matchers carry a fixed `type` of "date" and match one exact
      // granularity: an unset component (`forDate(2026)` has no month/day)
      // requires the node's component to be null, so a year matcher matches the
      // year archive only, not that year's month/day archives.
      return (
        match.type === "date" &&
        match.year === node.year &&
        (match.month ?? null) === node.month &&
        (match.day ?? null) === node.day
      );
    case "custom":
      // A `forArchiveType(name)` matcher carries the archive-type name as `type`.
      return match.type === node.name;
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
 * Resolve a node to its rule: (1) targeted rules (`forEntryType`/
 * `forTermTaxonomy`, incl. `whereMeta`/`where`/`named` predicates) in
 * declaration order, first match wins; (2) the generic tier for the node's
 * kind; (3) the universal `fallback`. Returns `undefined` when the rule set
 * covers none of the three. `data` is required for predicate rules to match.
 */
export function resolveRule<Rule extends TierMatchRule>(
  rules: readonly Rule[],
  node: ResolvedNode,
  data?: TemplateData,
): Rule | undefined {
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
 * Look up an error-tier rule (`notFound` → 404, `serverError` → 500). Separate
 * from `resolveRule` because the error tiers fire on a condition — no match, or
 * a render throw — rather than on a resolved node.
 */
export function resolveErrorRule<Rule extends TierMatchRule>(
  rules: readonly Rule[],
  tier: "notFound" | "serverError",
): Rule | undefined {
  return rules.find((r) => r.tier === tier);
}

/**
 * A short human label for a rule — its tier, or (for a targeted rule) the type
 * plus any `:slug` / `#id` narrowing. Used by the debug bar and as the
 * normalize-error slot name.
 */
export function ruleLabel(rule: TierMatchRule): string {
  if (rule.tier !== undefined) return rule.tier;
  const m = rule.match;
  if (m === undefined) return "?";
  let sel = "";
  if (m.slug !== undefined) sel = `:${m.slug}`;
  else if (m.id !== undefined) sel = `#${m.id}`;
  const prefix = m.nodeKind === "content-type-archive" ? "archive:" : "";
  return `${prefix}${m.type}${sel}`;
}
