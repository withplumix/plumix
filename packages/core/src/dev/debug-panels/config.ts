import type { DebugPanelsInput } from "../../context/dev-runtime.js";

export function disabledPanelIds(
  input: DebugPanelsInput = {},
): ReadonlySet<string> {
  const disabled = new Set<string>();
  // An absent or `undefined` key shows the panel. The annotation restores the
  // `undefined` that `Object.entries` drops, or lint calls the comparison
  // redundant.
  const entries: readonly (readonly [string, boolean | undefined])[] =
    Object.entries(input);
  for (const [id, shown] of entries) {
    if (shown === false) disabled.add(id);
  }
  return disabled;
}
