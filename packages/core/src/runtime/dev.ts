import type { DevInput } from "../config.js";
import type { NormalizedDebugBar } from "../dev/debug-bar/config.js";
import type { DebugHistoryStore } from "../dev/request-history/store.js";
import { normalizeDebugBar } from "../dev/debug-bar/config.js";
import { disabledPanelIds } from "../dev/debug-panels/config.js";
import { createDebugHistoryStore } from "../dev/request-history/store.js";

/**
 * `config.dev`, resolved once when the app is built: the same keys, each in
 * the form its readers consume. The app holds one and hands it to every
 * request as `ctx.dev`. Composed here rather than under `dev/` for the reason
 * `DevInput` lives in `config.ts` — no module in the dev tree has to name all
 * of its layers (ADR 0003).
 */
export interface DevRuntime {
  /** `config.dev.bar`, normalized. */
  readonly bar: NormalizedDebugBar;
  /** `config.dev.panels`, resolved once for both dev surfaces. */
  readonly panels: { readonly disabled: ReadonlySet<string> };
  /** The request-history ring, built from `config.dev.history`. */
  readonly history: DebugHistoryStore;
}

export function createDevRuntime(input: DevInput | undefined): DevRuntime {
  return {
    bar: normalizeDebugBar(input?.bar),
    panels: { disabled: disabledPanelIds(input?.panels) },
    history: createDebugHistoryStore(input?.history),
  };
}
