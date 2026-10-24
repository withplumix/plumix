import { renderToStaticMarkup } from "react-dom/server";

import type { Logger } from "../../context/app-context.js";
import type { DebugPanel, DevRegistered } from "../../context/dev-runtime.js";
import type { Label } from "../../i18n/label.js";
import type { DebugSnapshot } from "../request-history/snapshot.js";
import { logErrorSafely } from "../../context/log.js";

/**
 * One panel rendered to inert HTML — the unit the bar and the read route swap
 * in.
 */
export interface RenderedDebugPanel {
  readonly id: string;
  readonly title: Label;
  readonly html: string;
}

/**
 * A panel whose render throws is left out and logged, so it can't crash the
 * host page the bar is meant to help debug.
 */
export function renderDebugPanels(
  panels: readonly DevRegistered<DebugPanel>[],
  snapshot: DebugSnapshot,
  logger: Logger,
): readonly RenderedDebugPanel[] {
  const rendered: RenderedDebugPanel[] = [];
  for (const panel of panels) {
    try {
      const html = renderToStaticMarkup(<>{panel.render(snapshot)}</>);
      rendered.push({ id: panel.id, title: panel.title, html });
    } catch (error) {
      const plugin = panel.registeredBy ?? "core";
      logErrorSafely(
        logger,
        `[plumix] debug panel "${panel.id}" failed to render plugin=${plugin}`,
        error,
        { id: panel.id, plugin: panel.registeredBy },
      );
    }
  }
  return rendered;
}
