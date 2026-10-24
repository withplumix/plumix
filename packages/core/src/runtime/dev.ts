import type { DevInput } from "../config.js";
import type { MutableDevRuntime } from "../context/dev-runtime.js";
import { normalizeDebugBar } from "../dev/debug-bar/config.js";
import { disabledPanelIds } from "../dev/debug-panels/config.js";
import { createCaughtMailStore } from "../dev/mail/store.js";
import { createDebugHistoryStore } from "../dev/request-history/store.js";

export type { DevRuntime } from "../context/dev-runtime.js";

export function createDevRuntime(
  input: DevInput | undefined,
): MutableDevRuntime {
  return {
    bar: normalizeDebugBar(input?.bar),
    panels: { disabled: disabledPanelIds(input?.panels) },
    history: createDebugHistoryStore(input?.history),
    mail: createCaughtMailStore(input?.history),
    debugPanels: new Map(),
    errorPanels: new Map(),
    errorHints: new Map(),
  };
}
