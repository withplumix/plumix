import type { ReactNode } from "react";

import type { AppContext } from "../../context/app-context.js";
import { collectDebugPanels } from "../debug-panels/collect.js";
import { DebugPanelTabs } from "../debug-panels/panels-view.js";
import { renderDebugPanels } from "../debug-panels/render-panels.js";
import { projectDebugSnapshot } from "../request-history/snapshot.js";
import { isTrustedDevRequest } from "../trust.js";
import { DEBUG_BAR_CSS } from "./styles.js";
import {
  buildSwitcherEntries,
  DEBUG_SWITCHER_SCRIPT,
  switcherEndpoint,
  switcherOptionLabel,
} from "./switcher.js";

/**
 * Renders nothing off-loopback: the bar's SQL and span tree would go to
 * whoever reached the dev server rather than the developer running it.
 */
export function debugBarChrome(ctx: AppContext): ReactNode {
  return isTrustedDevRequest(ctx.request) ? <PlumixDebugBar ctx={ctx} /> : null;
}

/**
 * Must render only under the dev gate at the injection site, so this module
 * and its switcher script tree-shake from production builds.
 */
export function PlumixDebugBar({
  ctx,
}: {
  readonly ctx: AppContext;
}): ReactNode {
  const dev = ctx.dev;
  if (!dev?.bar.enabled) return null;
  const config = dev.bar;

  const panels = collectDebugPanels(ctx.hooks, ctx, dev.panels.disabled);
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
    dev.history.get(),
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
            data-plumix-debug-endpoint={switcherEndpoint(ctx.config.basePath)}
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
