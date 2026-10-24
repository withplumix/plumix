import { renderToStaticMarkup } from "react-dom/server";

import type { AppContext } from "../../../context/app-context.js";
import type {
  DevErrorPanel,
  DevRegistered,
  DevRuntime,
} from "../../../context/dev-runtime.js";
import type { RenderedDevErrorPanel } from "../../ui/index.js";
import { logErrorSafely } from "../../../context/log.js";
import { DEFAULT_PANEL_ORDER } from "../../debug-panels/collect.js";

/**
 * The registered panels whose `visible` accepts the error, rendered. A panel
 * whose `visible` or `render` throws is left out and logged, so it can't take
 * down the page.
 */
export function collectDevErrorPanels(
  dev: DevRuntime,
  error: unknown,
  ctx: AppContext,
): readonly RenderedDevErrorPanel[] {
  const ordered = [...dev.errorPanels.values()].sort(
    (a, b) =>
      (a.order ?? DEFAULT_PANEL_ORDER) - (b.order ?? DEFAULT_PANEL_ORDER),
  );
  const rendered: RenderedDevErrorPanel[] = [];
  for (const panel of ordered) {
    try {
      if (!(panel.visible?.(error) ?? true)) continue;
      const html = renderToStaticMarkup(<>{panel.render(error, ctx)}</>);
      rendered.push({ id: panel.id, title: panel.title, html });
    } catch (failure) {
      logPanelFailure(ctx, panel, failure);
    }
  }
  return rendered;
}

function logPanelFailure(
  ctx: AppContext,
  panel: DevRegistered<DevErrorPanel>,
  failure: unknown,
): void {
  const plugin = panel.registeredBy ?? "core";
  logErrorSafely(
    ctx.logger,
    `[plumix] error panel "${panel.id}" failed plugin=${plugin}`,
    failure,
    { id: panel.id, plugin: panel.registeredBy },
  );
}
