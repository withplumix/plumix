import type {
  DebugPanel,
  DevRegistered,
  DevRuntime,
} from "../../context/dev-runtime.js";

/**
 * Unordered panels sort after every explicitly-ordered one. Finite (not
 * Infinity) so two unordered panels compare as 0, not NaN.
 */
export const DEFAULT_PANEL_ORDER = Number.MAX_SAFE_INTEGER;

/** The registered panels config leaves on, by `order` then registration. */
export function collectDebugPanels(
  dev: DevRuntime,
): readonly DevRegistered<DebugPanel>[] {
  return [...dev.debugPanels.values()]
    .filter((panel) => !dev.panels.disabled.has(panel.id))
    .sort(
      (a, b) =>
        (a.order ?? DEFAULT_PANEL_ORDER) - (b.order ?? DEFAULT_PANEL_ORDER),
    );
}
