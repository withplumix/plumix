import type {
  DebugBarPosition,
  NormalizedDebugBar,
} from "../../context/dev-runtime.js";

export type { NormalizedDebugBar } from "../../context/dev-runtime.js";
/**
 * `dev.bar`: the overlay itself. Only what the bar alone reads lives here —
 * which panels it shows is `dev.panels`, read identically by the history read
 * routes, a surface with no bar in it.
 *
 * `false` is the only spelling of off; there is no `enabled` key, because two
 * spellings of one thing is how the slot this replaced grew four settings with
 * three meanings.
 */
export type DebugBarInput =
  | boolean
  | {
      readonly position?: DebugBarPosition;
      readonly defaultOpen?: boolean;
    };

export function normalizeDebugBar(
  input: DebugBarInput | undefined,
): NormalizedDebugBar {
  const options = typeof input === "object" ? input : {};
  // Default-on: only an explicit `false` suppresses the bar. The compile-time
  // dev gate is separate — this resolves intent.
  return {
    enabled: input !== false,
    position: options.position ?? "bottom-right",
    defaultOpen: options.defaultOpen ?? false,
  };
}
