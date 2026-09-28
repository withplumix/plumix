import type { DevInput } from "../config.js";
import type { DevRuntime } from "../context/dev-runtime.js";
import { normalizeDebugBar } from "../dev/debug-bar/config.js";
import { disabledPanelIds } from "../dev/debug-panels/config.js";
import { createDebugHistoryStore } from "../dev/request-history/store.js";

export type { DevRuntime } from "../context/dev-runtime.js";

export function createDevRuntime(input: DevInput | undefined): DevRuntime {
  return {
    bar: normalizeDebugBar(input?.bar),
    panels: { disabled: disabledPanelIds(input?.panels) },
    history: createDebugHistoryStore(input?.history),
  };
}
