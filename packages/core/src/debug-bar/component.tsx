import type { ReactNode } from "react";

import type { AppContext } from "../context/app.js";
import { collectDebugPanels } from "./collect.js";
import { normalizeDebugBar } from "./config.js";
import { DebugPanelTabs } from "./panels-view.js";
import { renderDebugPanels } from "./render-panels.js";
import { projectDebugSnapshot } from "./snapshot.js";
import { DEBUG_BAR_CSS } from "./styles.js";

/**
 * The development-only debug bar. Standalone and auth-independent (unlike the
 * admin bar it does not gate on a user), fully server-rendered and zero-JS:
 * a native <details> toggles it and radio inputs drive the tabs. Rendered
 * only under the dev gate at the injection site, so it — and this whole
 * module — is tree-shaken from production builds. Panels render from a
 * {@link DebugSnapshot} projected from the current request.
 */
export function PlumixDebugBar({
  ctx,
}: {
  readonly ctx: AppContext;
}): ReactNode {
  const config = normalizeDebugBar(ctx.debugBar);
  if (!config.enabled) return null;

  const panels = collectDebugPanels(ctx.hooks, ctx, config.disabled);
  if (panels.length === 0) return null;

  const snapshot = projectDebugSnapshot(
    { spans: ctx.telemetry.getSpans(), records: ctx.telemetry.getRecords() },
    ctx,
  );
  const rendered = renderDebugPanels(panels, snapshot);

  return (
    <>
      <style data-testid="plumix-debug-bar-style">{DEBUG_BAR_CSS}</style>
      <div
        className="plumix-debug-bar"
        data-testid="plumix-debug-bar"
        data-position={config.position}
        dir="ltr"
      >
        <details open={config.defaultOpen}>
          <summary>Debug</summary>
          <DebugPanelTabs rendered={rendered} />
        </details>
      </div>
    </>
  );
}
