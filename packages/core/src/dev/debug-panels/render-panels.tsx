import { renderToStaticMarkup } from "react-dom/server";

import type { Label } from "../../i18n/label.js";
import type { DebugSnapshot } from "../request-history/snapshot.js";
import type { DebugPanel } from "./types.js";

/**
 * One panel rendered to inert HTML — the unit the bar and the read route swap
 * in.
 */
export interface RenderedDebugPanel {
  readonly id: string;
  readonly title: Label;
  readonly html: string;
}

// A panel that throws yields a fallback rather than crashing the host page
// the bar is meant to help debug.
function renderPaneHtml(panel: DebugPanel, snapshot: DebugSnapshot): string {
  try {
    return renderToStaticMarkup(<>{panel.render(snapshot)}</>);
  } catch (error) {
    console.error(`[plumix] debug panel "${panel.id}" failed to render`, error);
    return renderToStaticMarkup(
      <p className="plumix-debug-bar__error">
        Panel “{panel.id}” failed to render.
      </p>,
    );
  }
}

/**
 * Panel collection stays the caller's job: the `debug:panels` filter is keyed
 * on live app hooks, not the snapshot.
 */
export function renderDebugPanels(
  panels: readonly DebugPanel[],
  snapshot: DebugSnapshot,
): readonly RenderedDebugPanel[] {
  return panels.map((panel) => ({
    id: panel.id,
    title: panel.title,
    html: renderPaneHtml(panel, snapshot),
  }));
}
