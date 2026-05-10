import { describe, expect, test } from "vitest";

import { createDeferQueue } from "./defer.js";

describe("createDeferQueue", () => {
  test("drainDeferred awaits every queued promise before resolving", async () => {
    const events: string[] = [];
    const { defer, drainDeferred } = createDeferQueue();

    defer(
      new Promise<void>((resolve) =>
        setTimeout(() => {
          events.push("first");
          resolve();
        }, 10),
      ),
    );
    defer(
      new Promise<void>((resolve) =>
        setTimeout(() => {
          events.push("second");
          resolve();
        }, 5),
      ),
    );

    await drainDeferred();

    // Both timers fired before drain resolved (order depends on the
    // scheduler — only the count matters).
    expect(events).toHaveLength(2);
  });

  test("rejections in queued promises don't bubble out of drainDeferred", async () => {
    // The harness mirrors the production fire-and-forget contract —
    // a misbehaving deferred task can't fail an unrelated test by
    // surfacing as an unhandled rejection inside `drainDeferred`.
    const { defer, drainDeferred } = createDeferQueue();
    defer(Promise.reject(new Error("boom")));
    defer(Promise.resolve("ok"));

    await expect(drainDeferred()).resolves.toBeUndefined();
  });

  test("drainDeferred is a no-op when nothing was deferred", async () => {
    const { drainDeferred } = createDeferQueue();
    await expect(drainDeferred()).resolves.toBeUndefined();
  });

  test("drainDeferred picks up tasks deferred during a previous drain", async () => {
    // Re-entrant `defer` calls (a deferred task itself enqueues more
    // work) should be visible to the next `drainDeferred()` so a
    // chain of background work can be tested deterministically.
    const events: string[] = [];
    const { defer, drainDeferred } = createDeferQueue();

    defer(
      Promise.resolve().then(() => {
        events.push("first");
        // Nested deferred work uses setTimeout so it doesn't drain in
        // the same microtask as the parent — that's the real-world
        // shape of "background task A queues background task B".
        defer(
          new Promise<void>((resolve) =>
            setTimeout(() => {
              events.push("nested");
              resolve();
            }, 5),
          ),
        );
      }),
    );

    await drainDeferred();
    expect(events).toEqual(["first"]);

    await drainDeferred();
    expect(events).toEqual(["first", "nested"]);
  });
});
