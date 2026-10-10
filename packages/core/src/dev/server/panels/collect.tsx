import { renderToStaticMarkup } from "react-dom/server";

import type { AppContext } from "../../../context/app-context.js";
import type { HookExecutor } from "../../../hooks/registry.js";
import type { RenderedDevErrorPanel } from "../../ui/index.js";
import type { DevErrorPanel } from "./types.js";
import { DevErrorEmptyNote } from "../../ui/panel-primitives.js";

import "./types.js";

// Unordered panels sort after every explicitly-ordered one. Finite (not
// Infinity) so two unordered panels compare as 0, not NaN. Mirrors the debug
// bar's collector.
const DEFAULT_PANEL_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * Isolates each `error_page:panels` handler so a throw during collection can't
 * take down the page. Duplicate ids: the last contributor wins.
 */
export function collectDevErrorPanels(
  hooks: HookExecutor,
  error: unknown,
  ctx: AppContext,
): readonly RenderedDevErrorPanel[] {
  const contributed = hooks.applyFilterIsolated(
    "error_page:panels",
    [],
    error,
    ctx,
  );

  const byId = new Map<string, DevErrorPanel>();
  for (const panel of contributed) byId.set(panel.id, panel);

  return [...byId.values()]
    .sort(
      (a, b) =>
        (a.order ?? DEFAULT_PANEL_ORDER) - (b.order ?? DEFAULT_PANEL_ORDER),
    )
    .map((panel) => ({
      id: panel.id,
      title: panel.title,
      html: renderPanelHtml(panel, error, ctx),
    }));
}

// A panel that throws yields a fallback rather than crashing the host page
// the error surface is meant to help debug.
function renderPanelHtml(
  panel: DevErrorPanel,
  error: unknown,
  ctx: AppContext,
): string {
  try {
    return renderToStaticMarkup(<>{panel.render(error, ctx)}</>);
  } catch (err) {
    console.error(
      `[plumix] dev error panel "${panel.id}" failed to render`,
      err,
    );
    return renderToStaticMarkup(
      <DevErrorEmptyNote>
        Panel “{panel.id}” failed to render.
      </DevErrorEmptyNote>,
    );
  }
}
