import type { AppContext } from "../../context/app.js";
import type {
  ResolutionStep,
  ResolutionTrace,
} from "../../route/render/template-hierarchy.js";
import type { DebugPanel } from "../types.js";
import { DebugKV, DebugSection, DebugTable } from "../primitives.js";
import { TEMPLATE_PANEL_ID } from "../template-node-label.js";

/** Recorded by the renderer; read by the panel. */
export interface TemplateResolution extends ResolutionTrace {
  /** Human label for the resolved route node, e.g. "post: hello-world". */
  readonly nodeLabel: string;
}

/** How a predicate reads in the table — or an em dash when the rule has none. */
function predicateCell(predicate: ResolutionStep["predicate"]): string {
  if (predicate === undefined) return "—";
  // `fired` false means identity didn't match (or no data), so it never ran.
  if (!predicate.fired) return "n/a";
  return predicate.result ? "passed" : "failed";
}

/**
 * The Template panel: the full resolution walk for this request — every rule in
 * the theme's `templates` array, which one matched, which were skipped, and
 * which were never reached. Empty on error pages, which don't resolve a node.
 */
export const templatePanel: DebugPanel = {
  id: TEMPLATE_PANEL_ID,
  title: "Template",
  order: 15,
  render: (ctx: AppContext) => {
    const resolution = ctx.debug.get(TEMPLATE_PANEL_ID)[0] as
      TemplateResolution | undefined;
    if (!resolution) {
      return (
        <p className="plumix-debug-bar__empty">
          No template resolution — this is likely an error page.
        </p>
      );
    }
    return (
      <>
        <DebugSection title="Resolution">
          <DebugKV
            rows={[
              { label: "Resolved", value: resolution.nodeLabel },
              {
                label: "Matched",
                value: resolution.winner ?? "— (no match → 404)",
              },
            ]}
          />
        </DebugSection>
        <DebugSection title="Rules">
          <DebugTable
            headers={["Rule", "Status", "Predicate"]}
            rows={resolution.steps.map((step) => [
              step.label,
              <span
                className={`plumix-debug-bar__status plumix-debug-bar__status--${step.status}`}
              >
                {step.status}
              </span>,
              predicateCell(step.predicate),
            ])}
          />
        </DebugSection>
      </>
    );
  },
};
