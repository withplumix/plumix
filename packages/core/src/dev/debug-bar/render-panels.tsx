import { renderToStaticMarkup } from "react-dom/server";

import type { Label } from "../../i18n/label.js";
import type { DebugSnapshot } from "./snapshot.js";
import type { DebugPanel } from "./types.js";

/** One panel rendered to inert HTML — the unit the bar and the read route swap in. */
export interface RenderedDebugPanel {
  readonly id: string;
  readonly title: Label;
  readonly html: string;
}

// Render each panel in isolation: a panel that throws (author logic or a child
// component during SSR) yields a fallback instead of crashing the host page —
// exactly the page the bar is meant to help debug.
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
 * The single rendering entry: turns a {@link DebugSnapshot} into each panel's
 * HTML. Pure — no `ctx`, no store, no worker globals. Panel collection stays
 * the caller's job, since the `debug_bar:panels` filter is keyed on live app
 * hooks, not the snapshot.
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
