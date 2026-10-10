// Same timing as `load`; the difference (no SSR markup) lives in the SSR shim.

import type { IslandStrategy } from "../island-element.js";
import { publishIslandStrategy } from "../island-global.js";

export const onlyStrategy: IslandStrategy = (loadFn) => {
  void loadFn();
};

export function registerOnlyStrategy(): void {
  publishIslandStrategy("only", onlyStrategy);
}
