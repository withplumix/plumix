import type { AppContext } from "../context/app.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { DebugPanel } from "./types.js";

// Unordered panels sort after every explicitly-ordered one. Finite (not
// Infinity) so two unordered panels compare as 0, not NaN.
const DEFAULT_PANEL_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * Gathers the request's debug panels: runs the `debug_bar:panels` filter
 * chain — isolating each handler so a throw or non-array return during
 * *collection* can't take down the bar — then drops denylisted ids, dedupes
 * by id (last contributor wins), and returns them ordered by ascending
 * `order`. A panel throwing from its own `render` is a separate concern the
 * collector can't see.
 */
export function collectDebugPanels(
  hooks: HookExecutor,
  ctx: AppContext,
  disabled: ReadonlySet<string>,
): readonly DebugPanel[] {
  let panels: readonly DebugPanel[] = [];
  for (const { fn, plugin } of hooks.getFilterHandlers("debug_bar:panels")) {
    try {
      const next = fn(panels, ctx);
      if (Array.isArray(next)) {
        panels = next;
      } else {
        console.error(
          `[plumix] debug_bar:panels handler returned non-array plugin=${plugin ?? "core"}; contribution discarded`,
        );
      }
    } catch (error) {
      console.error(
        `[plumix] debug_bar:panels handler failed plugin=${plugin ?? "core"}`,
        error,
      );
    }
  }

  const byId = new Map<string, DebugPanel>();
  for (const p of panels) {
    if (disabled.has(p.id)) continue;
    byId.set(p.id, p);
  }

  return [...byId.values()].sort(
    (a, b) =>
      (a.order ?? DEFAULT_PANEL_ORDER) - (b.order ?? DEFAULT_PANEL_ORDER),
  );
}
