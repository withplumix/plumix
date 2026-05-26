// `idle` strategy — hydrate in a `requestIdleCallback` slot so the work
// lands after the browser finishes more urgent main-thread tasks.
//
// Two deviations from the implementations we studied, both deliberate:
//   - Astro passes no `timeout`, so under sustained main-thread load the
//     callback can starve and the island never hydrates. Nuxt caps at
//     10s, an eternity for something below the fold the user is about to
//     reach. We cap at 2000ms by default (override via `opts.timeout`) —
//     idle fires sooner when the thread is free, but is guaranteed within
//     the cap.
//   - The Safari/no-`requestIdleCallback` fallback is `setTimeout(200)`
//     (Astro's value), not Nuxt's `setTimeout(1)` — 200ms keeps eager
//     hydration off the critical first-paint window without a perceptible
//     delay.

import type { IslandStrategy } from "../island-element.js";

const DEFAULT_TIMEOUT_MS = 2000;
const FALLBACK_DELAY_MS = 200;

interface IdleWindow {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
}

export const idleStrategy: IslandStrategy = (loadFn, opts) => {
  const timeout =
    typeof opts.timeout === "number" ? opts.timeout : DEFAULT_TIMEOUT_MS;
  const run = (): void => void loadFn();
  const w = self as unknown as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(run, { timeout });
    return;
  }
  setTimeout(run, FALLBACK_DELAY_MS);
};

export function registerIdleStrategy(): void {
  const target = self as unknown as {
    Plumix?: Record<string, IslandStrategy>;
  };
  target.Plumix = { ...(target.Plumix ?? {}), idle: idleStrategy };
}
