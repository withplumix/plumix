import type { AppContext } from "../../context/app.js";
import type { DebugPanel } from "../types.js";
import { DebugKV, DebugSection } from "../primitives.js";
import { TEMPLATE_PANEL_ID } from "../template-node-label.js";

/** Recorded by the renderer; read by the panel. */
export interface TemplateResolution {
  /** Human label for the resolved route node, e.g. "post: hello-world". */
  readonly nodeLabel: string;
  /** The matched rule's label — its tier, or its targeted type + narrowing. */
  readonly picked: string;
}

/**
 * The Template panel: how the theme's `templates` array resolved for this
 * request — the route node and which rule matched. Empty on error pages,
 * which don't run rule resolution.
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
      <DebugSection title="Resolution">
        <DebugKV
          rows={[
            { label: "Resolved", value: resolution.nodeLabel },
            { label: "Matched", value: resolution.picked },
          ]}
        />
      </DebugSection>
    );
  },
};
