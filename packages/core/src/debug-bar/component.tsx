import type { ReactNode } from "react";

import type { AppContext } from "../context/app.js";
import { labelSourceText } from "../i18n/label.js";
import { collectDebugPanels } from "./collect.js";
import { normalizeDebugBar } from "./config.js";
import { DEBUG_BAR_CSS } from "./styles.js";

/**
 * The development-only debug bar. Standalone and auth-independent (unlike the
 * admin bar it does not gate on a user), fully server-rendered and zero-JS:
 * a native <details> toggles it and radio inputs drive the tabs. Rendered
 * only under the dev gate at the injection site, so it — and this whole
 * module — is tree-shaken from production builds.
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

  const name = "plumix-debug-tab";
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
          {panels.map((panel, index) => (
            <input
              key={panel.id}
              className="plumix-debug-bar__radio"
              type="radio"
              name={name}
              id={`${name}-${panel.id}`}
              defaultChecked={index === 0}
            />
          ))}
          <nav className="plumix-debug-bar__labels">
            {panels.map((panel) => (
              <label key={panel.id} htmlFor={`${name}-${panel.id}`}>
                {labelSourceText(panel.title)}
              </label>
            ))}
          </nav>
          <div className="plumix-debug-bar__panes">
            {panels.map((panel) => (
              <section
                key={panel.id}
                className="plumix-debug-bar__pane"
                data-testid={`plumix-debug-panel-${panel.id}`}
              >
                {panel.render(ctx)}
              </section>
            ))}
          </div>
        </details>
      </div>
    </>
  );
}
