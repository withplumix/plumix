// What each strategy reads from an island's `opts` attribute, apart from the
// DOM it drives.

import type { JsonObject } from "../../json.js";
import { isJsonArray } from "../../json.js";

/**
 * Capped so the idle callback can't starve under sustained main-thread load.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 2000;

export function idleTimeout(opts: JsonObject): number {
  return typeof opts.timeout === "number"
    ? opts.timeout
    : DEFAULT_IDLE_TIMEOUT_MS;
}

/** Warms the chunk before the island enters view. */
const DEFAULT_ROOT_MARGIN = "200px";

export function visibleRootMargin(opts: JsonObject): string {
  return typeof opts.rootMargin === "string"
    ? opts.rootMargin
    : DEFAULT_ROOT_MARGIN;
}

/**
 * `pointerenter` doesn't bubble, so it can trigger hydration but is never
 * replayed.
 */
export const INTERACTION_EVENTS = [
  "pointerenter",
  "focusin",
  "pointerdown",
  "click",
  "keydown",
] as const;

/** The events that hydrate an island: its `opts.events`, else all of them. */
export function interactionEvents(opts: JsonObject): ReadonlySet<string> {
  const raw = opts.events;
  // `isJsonArray`, not `Array.isArray`: the latter widens a `JsonValue` to
  // `any[]` and leaves the readonly array on the object side of the union.
  const list =
    raw !== undefined && isJsonArray(raw)
      ? raw.filter((e): e is string => typeof e === "string")
      : null;
  return new Set(list && list.length > 0 ? list : INTERACTION_EVENTS);
}
