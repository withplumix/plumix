import type { DebugPanelsInput } from "../../context/dev-runtime.js";

/**
 * The ids {@link collectDebugPanels} drops, as a Set for O(1) `.has(id)` at
 * collect time. Both dev surfaces resolve it from the same input, which is why
 * it belongs to the panel layer and not to either of them.
 */
export function disabledPanelIds(
  input: DebugPanelsInput = {},
): ReadonlySet<string> {
  const disabled = new Set<string>();
  // An absent key — or one written as `undefined` — shows the panel, so the
  // test below has to stay a comparison. `Object.entries` drops the
  // `undefined` that `Partial` put on every value, and the annotation puts it
  // back; without it the comparison reads as redundant and lint rejects it.
  const entries: readonly (readonly [string, boolean | undefined])[] =
    Object.entries(input);
  for (const [id, shown] of entries) {
    if (shown === false) disabled.add(id);
  }
  return disabled;
}
