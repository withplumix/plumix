// Strategies and `<plumix-island>` ship as separate chunks and meet on a
// global namespace: the runtime entry publishes each strategy under its
// `client="…"` name, the element resolves that name at hydration time.
// This module is the only place that touches the global — publishing
// merges rather than replaces, so the five strategy modules can register
// in any order without dropping each other.

import type { IslandStrategy } from "./island-element.js";

export function islandStrategy(name: string): IslandStrategy | undefined {
  return window.Plumix?.[name];
}

export function publishIslandStrategy(
  name: string,
  strategy: IslandStrategy,
): void {
  window.Plumix = { ...window.Plumix, [name]: strategy };
}
