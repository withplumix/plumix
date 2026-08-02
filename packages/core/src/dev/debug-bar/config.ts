// Local: referenced only by DebugBarInput/NormalizedDebugBar in this file.
// Users write the position as a string literal, so it needs no public name.
type DebugBarPosition =
  "bottom-right" | "bottom-left" | "top-right" | "top-left";

export type DebugBarInput =
  | boolean
  | {
      readonly enabled?: boolean;
      readonly disable?: readonly string[];
      readonly position?: DebugBarPosition;
      readonly defaultOpen?: boolean;
    };

export interface NormalizedDebugBar {
  readonly enabled: boolean;
  /** Denylist of panel ids, as a Set for O(1) `.has(id)` at collect time. */
  readonly disabled: ReadonlySet<string>;
  readonly position: DebugBarPosition;
  readonly defaultOpen: boolean;
}

export function normalizeDebugBar(
  input: DebugBarInput | undefined,
): NormalizedDebugBar {
  const options = typeof input === "object" ? input : {};
  // Default-on: only an explicit `false` (bare or via `enabled`) suppresses
  // the bar. The compile-time dev gate is separate — this resolves intent.
  const enabled = input === false ? false : options.enabled !== false;
  return {
    enabled,
    disabled: new Set(options.disable ?? []),
    position: options.position ?? "bottom-right",
    defaultOpen: options.defaultOpen ?? false,
  };
}
