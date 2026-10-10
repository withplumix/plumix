import type { TemplateData, TemplateRule } from "../../theme.js";
import type { ResolvedNode } from "./rule-resolver.js";
import {
  matchesIdentity,
  resolveErrorRule,
  resolveRule,
  ruleLabel,
} from "./rule-resolver.js";

export type { ResolvedNode } from "./rule-resolver.js";
export { ruleLabel } from "./rule-resolver.js";

/**
 * {@link resolveRule} at `TemplateRule`: resolve a node to its template from a
 * theme's `templates` array. Returns `undefined` when nothing matches — the
 * caller then renders the `notFound` (404) template.
 */
export function resolveTemplate(
  rules: readonly TemplateRule[],
  node: ResolvedNode,
  data?: TemplateData,
): TemplateRule | undefined {
  return resolveRule(rules, node, data);
}

/**
 * {@link resolveErrorRule} at `TemplateRule`: the `notFound` (404) and
 * `serverError` (500) templates.
 */
export function resolveErrorTemplate(
  rules: readonly TemplateRule[],
  tier: "notFound" | "serverError",
): TemplateRule | undefined {
  return resolveErrorRule(rules, tier);
}

type ResolutionStatus = "matched" | "skipped" | "never-evaluated";

/**
 * `Readonly<{…}>`, not interfaces: a telemetry span attribute must satisfy
 * `JsonObject`, and interfaces lack the implicit index signature.
 */
export type ResolutionStep = Readonly<{
  label: string;
  status: ResolutionStatus;
  /**
   * Present for a targeted rule carrying a `whereMeta`/`where`/`named`
   * predicate. `fired` is whether the predicate function actually ran (its
   * rule's identity matched and `data` was present); `result` is its return.
   */
  predicate?: Readonly<{ fired: boolean; result: boolean }>;
}>;

export type ResolutionTrace = Readonly<{
  steps: readonly ResolutionStep[];
  /** The winning rule's label, or `null` when nothing matched (a 404). */
  winner: string | null;
}>;

/** The `template` span's `resolution` attribute, read back by the debug bar. */
export type TemplateResolution = ResolutionTrace &
  Readonly<{
    /** Human label for the resolved route node, e.g. "post: hello-world". */
    nodeLabel: string;
  }>;

/**
 * A separate replay so `resolveRule` stays allocation-free on the render hot
 * path.
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
