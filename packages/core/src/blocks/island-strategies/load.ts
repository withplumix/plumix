import type { IslandStrategy } from "../island-element.js";
import { publishIslandStrategy } from "../island-global.js";

export const loadStrategy: IslandStrategy = (loadFn) => {
  void loadFn();
};

export function registerLoadStrategy(): void {
  publishIslandStrategy("load", loadStrategy);
}
