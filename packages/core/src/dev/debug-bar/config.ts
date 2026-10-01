import type {
  DebugBarInput,
  NormalizedDebugBar,
} from "../../context/dev-runtime.js";

export type { NormalizedDebugBar } from "../../context/dev-runtime.js";

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
