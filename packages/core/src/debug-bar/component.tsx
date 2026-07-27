import type { ReactNode } from "react";

import type { AppContext } from "../context/app.js";
import { collectDebugPanels } from "./collect.js";
import { normalizeDebugBar } from "./config.js";
import { debugHistory } from "./history.js";
import { DebugPanelTabs } from "./panels-view.js";
import { renderDebugPanels } from "./render-panels.js";
import { projectDebugSnapshot } from "./snapshot.js";
import { DEBUG_BAR_CSS } from "./styles.js";
import {
  buildSwitcherEntries,
  DEBUG_SWITCHER_SCRIPT,
  switcherEndpoint,
  switcherOptionLabel,
} from "./switcher.js";

/**
 * The development-only debug bar. Standalone and auth-independent (unlike the
 * admin bar it does not gate on a user). The current request's panels are
 * fully server-rendered and zero-JS: a native <details> toggles the bar and
 * radio inputs drive the tabs. Its one client-JS concession is the request
 * switcher — a <select> of recent captured requests; picking a past one fetches
 * its pre-rendered panels and swaps them in (see {@link DEBUG_SWITCHER_SCRIPT}).
 * Rendered only under the dev gate at the injection site, so it — and this whole
 * module, script included — is tree-shaken from production builds. Panels render
 * from a {@link DebugSnapshot} projected from the current request.
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

  // The current request isn't captured until request-end, so seed it from the
  // snapshot; it leads the switcher and is pre-selected via the <select>'s
  // defaultValue.
  const entries = buildSwitcherEntries(
    {
      id: ctx.requestId,
      method: snapshot.context.method,
      path: snapshot.context.path,
    },
    debugHistory.get(),
  );

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
          <div
            className="plumix-debug-bar__history"
            data-plumix-debug-switch=""
            data-plumix-debug-endpoint={switcherEndpoint(ctx.basePath)}
          >
            <select
              className="plumix-debug-bar__switcher"
              data-testid="plumix-debug-switcher"
              aria-label="Recent requests"
              defaultValue={ctx.requestId}
            >
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {switcherOptionLabel(entry)}
                </option>
              ))}
            </select>
            <div
              className="plumix-debug-bar__panels"
              data-testid="plumix-debug-panels"
              data-plumix-debug-panels=""
            >
              <DebugPanelTabs rendered={rendered} />
            </div>
          </div>
        </details>
      </div>
      <script
        data-testid="plumix-debug-switcher-script"
        dangerouslySetInnerHTML={{ __html: DEBUG_SWITCHER_SCRIPT }}
      />
    </>
  );
}
