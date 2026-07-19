import type { AppContext } from "../../context/app.js";
import type { DebugPanel } from "../types.js";
import { DebugKV, DebugSection } from "../primitives.js";
import { TEMPLATE_PANEL_ID } from "../template-node-label.js";

/** Recorded by the renderer; read by the panel. */
export interface TemplateResolution {
  /** Human label for the resolved route node, e.g. "post: hello-world". */
  readonly nodeLabel: string;
  /** Ordered candidate template names (after the `template:hierarchy` filter). */
  readonly candidates: readonly string[];
  /** The winning candidate — the template that rendered. */
  readonly picked: string;
}

/**
 * The Template panel: how the WordPress-style template hierarchy resolved for
 * this request — the ordered candidate list and which one won. Empty on error
 * pages, which don't run the hierarchy.
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
        <DebugKV
          rows={[
            { label: "Resolved", value: resolution.nodeLabel },
            { label: "Matched", value: resolution.picked },
          ]}
        />
        <DebugSection title="Candidates">
          <ol className="plumix-debug-bar__candidates">
            {resolution.candidates.map((candidate) => (
              <li
                key={candidate}
                className={`plumix-debug-bar__candidate ${
                  candidate === resolution.picked
                    ? "plumix-debug-bar__candidate--picked"
                    : ""
                }`}
              >
                {candidate}
              </li>
            ))}
          </ol>
        </DebugSection>
      </>
    );
  },
};
