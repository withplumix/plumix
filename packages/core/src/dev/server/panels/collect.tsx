import { renderToStaticMarkup } from "react-dom/server";

import type { AppContext } from "../../../context/app.js";
import type { HookExecutor } from "../../../hooks/registry.js";
import type { RenderedDevErrorPanel } from "../../ui/index.js";
import type { DevErrorPanel } from "./types.js";

import "./types.js";

// Unordered panels sort after every explicitly-ordered one. Finite (not
// Infinity) so two unordered panels compare as 0, not NaN. Mirrors the debug
// bar's collector.
const DEFAULT_PANEL_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * Gathers and renders the dev error page's plugin panels (#1626): runs the
 * `error_page:panels` filter chain — isolating each handler so a throw or
 * non-array return during collection can't take down the page — then dedupes by
 * id (last contributor wins), orders by ascending `order`, and renders each
 * panel in its own isolated SSR pass. Mirrors {@link collectDebugPanels}, but
 * renders inline (the error page has no stored snapshot / read route) and passes
 * the caught error and live `ctx` the way `error_page:hints` does.
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

// Render one panel in isolation: a panel that throws (author logic or a child
// component during SSR) yields a fallback instead of crashing the host page —
// exactly the page the error surface is meant to help debug.
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
      <p className="plumix-dev-error__empty">
        Panel “{panel.id}” failed to render.
      </p>,
    );
  }
}
