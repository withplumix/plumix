// Runnable example: a plugin handler kicks off fire-and-forget work
// via `ctx.defer`. The test runtime's `createDeferQueue()` lets the
// test wait for the background task to settle before asserting.
//
// In production (CF Workers) the same `ctx.defer` call would route
// through `executionCtx.waitUntil` and the work continues after the
// response is sent. In Node-style runtimes the default fallback
// catches rejections so a misbehaving task can't crash the process.

import { describe, expect, test } from "vitest";

import type { AppContext, Db } from "./app.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createDeferQueue } from "../test/defer.js";
import { createAppContext } from "./app.js";

const stubDb = {} as Db;

describe("ctx.defer — runnable example", () => {
  test("plugin handler dispatches background work that lands after the response", async () => {
    const writes: string[] = [];

    function pretendHandler(ctx: AppContext): string {
      // Synchronous return — simulating an RPC handler that returns
      // its response while sending an audit event in the background.
      ctx.defer(
        new Promise<void>((resolve) =>
          setTimeout(() => {
            writes.push("audit:event-recorded");
            resolve();
          }, 5),
        ),
      );
      return "response-sent";
    }

    const queue = createDeferQueue();
    const ctx = createAppContext({
      db: stubDb,
      env: {},
      request: new Request("https://x.example/"),
      hooks: new HookRegistry(),
      plugins: createPluginRegistry(),
      defer: queue.defer,
    });

    // The handler returns immediately; the audit write hasn't run yet.
    expect(pretendHandler(ctx)).toBe("response-sent");
    expect(writes).toEqual([]);

    // Drain the queue — equivalent to letting `waitUntil` finish its
    // tail in production. After this resolves, observable side effects
    // are committed.
    await queue.drainDeferred();
    expect(writes).toEqual(["audit:event-recorded"]);
  });
});
