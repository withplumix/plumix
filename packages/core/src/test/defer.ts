// Test harness for `AppContext.defer`. Production runtimes route
// fire-and-forget work through their platform primitive (CF Workers'
// `waitUntil`, Node's event loop). Tests need a deterministic queue
// they can flush + await before asserting on side effects, so this
// helper builds a `defer` implementation backed by an array plus a
// `drainDeferred()` that waits for everything queued so far.

import type { DeferFn } from "../context/app.js";

export interface DeferQueue {
  /** Pass to `createAppContext({ defer })` so handlers route here. */
  readonly defer: DeferFn;
  /**
   * Wait for every promise queued so far to settle (rejections are
   * swallowed — the test asserts on observable side effects, not on
   * the promise return values). Subsequent `defer` calls are queued
   * onto the same array, so a follow-up `drainDeferred()` picks them
   * up.
   *
   * `this: void` annotation lets callers destructure freely
   * (`const { drainDeferred } = createDeferQueue()`) without the
   * unbound-method lint rule complaining.
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
