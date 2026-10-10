// Strategies and the element ship as separate chunks and meet on this global.
// Publishing merges so strategies can register in any order.

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
