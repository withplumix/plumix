// Tests need a deterministic `defer` they can flush and await before asserting
// on side effects, unlike the platform's fire-and-forget `waitUntil`.

import type { DeferFn } from "../context/app-context.js";

export interface DeferQueue {
  /** Pass to `createAppContext({ defer })` so handlers route here. */
  readonly defer: DeferFn;
  /**
   * Wait for everything queued so far, swallowing rejections; tests assert on
   * side effects. `this: void` lets callers destructure it.
   */
  drainDeferred(this: void): Promise<void>;
}

export function createDeferQueue(): DeferQueue {
  const queued: Promise<unknown>[] = [];
  return {
    defer: (promise) => {
      queued.push(promise);
    },
    drainDeferred: async () => {
      // Splice rather than re-assign so a re-entrant `defer` during
      // the await captures into the SAME array — chained drains see
      // the new entries.
      const batch = queued.splice(0, queued.length);
      await Promise.allSettled(batch);
    },
  };
}
