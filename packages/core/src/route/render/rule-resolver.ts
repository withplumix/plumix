import type {
  GenericTier,
  TargetMatcher,
  TemplateData,
  TierMatchRule,
} from "../../theme.js";
import type { ResolvedNode } from "../contract/resolved-node.js";

export type { ResolvedNode } from "../contract/resolved-node.js";

// `fallback` and the error tiers are absent: they fire on a condition, not a
// node.
const GENERIC_TIER_FOR_NODE: Record<ResolvedNode["kind"], GenericTier> = {
  entry: "entry",
  entryType: "entryType",
  term: "term",
  author: "author",
  date: "date",
  // Plugin archives have no dedicated generic tier — they match via a
  // `forArchiveType(name)` targeted rule, else the universal `fallback`.
  archiveType: "fallback",
  // Nor have views: a `forView(name)` targeted rule, else `fallback`.
  view: "fallback",
  frontPage: "frontPage",
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
    case "entryType":
      return match.type === node.entryType;
    case "entry":
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
      // Exact granularity: `forDate(2026)` matches the year archive, not that
      // year's month/day archives.
      return (
        match.type === "date" &&
        match.year === node.year &&
        (match.month ?? null) === node.month &&
        (match.day ?? null) === node.day
      );
    case "archiveType":
    case "view":
      // A `forArchiveType(name)` or `forView(name)` matcher carries the
      // registered name as `type`.
      return match.type === node.name;
    default:
      return false;
  }
}

// A predicate rule never matches when `data` is absent.
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
 * Targeted rules first (declaration order), then the generic tier, then
 * `fallback`. Predicate rules need `data` to match.
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

export function ruleLabel(rule: TierMatchRule): string {
  if (rule.tier !== undefined) return rule.tier;
  const m = rule.match;
  if (m === undefined) return "?";
  let sel = "";
  if (m.slug !== undefined) sel = `:${m.slug}`;
  else if (m.id !== undefined) sel = `#${m.id}`;
  const prefix = m.nodeKind === "entryType" ? "archive:" : "";
  return `${prefix}${m.type}${sel}`;
}
