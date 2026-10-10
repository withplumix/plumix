// Capped so the callback can't starve under sustained main-thread load; the
// 200ms fallback keeps hydration off the first-paint window without a visible
// delay.

import type { IslandStrategy } from "../island-element.js";
import { publishIslandStrategy } from "../island-global.js";

const DEFAULT_TIMEOUT_MS = 2000;
const FALLBACK_DELAY_MS = 200;

export const idleStrategy: IslandStrategy = (loadFn, opts) => {
  const timeout =
    typeof opts.timeout === "number" ? opts.timeout : DEFAULT_TIMEOUT_MS;
  const run = (): void => void loadFn();
  if (typeof self.requestIdleCallback === "function") {
    self.requestIdleCallback(run, { timeout });
    return;
  }
  setTimeout(run, FALLBACK_DELAY_MS);
};

export function registerIdleStrategy(): void {
  publishIslandStrategy("idle", idleStrategy);
}
