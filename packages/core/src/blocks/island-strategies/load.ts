// `load` strategy — the simplest hydration trigger. Fires the chunk
// import as soon as the strategy runs, which happens immediately on
// `connectedCallback` for islands that don't declare `await-children`.
// Registers via `self.Plumix.load` so the custom element finds it on
// the global namespace. Exported as an IIFE-like initializer the
// runtime entry script wires up; theme code doesn't import this
// directly.

import type { IslandStrategy } from "../island-element.js";
import { publishIslandStrategy } from "../island-global.js";

export const loadStrategy: IslandStrategy = (loadFn) => {
  void loadFn();
};

export function registerLoadStrategy(): void {
  publishIslandStrategy("load", loadStrategy);
}
