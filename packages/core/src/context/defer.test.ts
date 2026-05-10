import { describe, expect, test, vi } from "vitest";

import type { Db, Logger } from "./app.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createAppContext } from "./app.js";

// Stub Db typed as the default CoreSchema so AppContext doesn't
// resolve to a non-default generic.
const stubDb = {} as Db;

describe("AppContext.defer", () => {
  test("ctx.defer forwards the promise to the runtime adapter implementation", () => {
    const calls: Promise<unknown>[] = [];
    const ctx = createAppContext({
      db: stubDb,
      env: {},
      request: new Request("https://x.example/"),
      hooks: new HookRegistry(),
      plugins: createPluginRegistry(),
      defer: (promise) => {
        calls.push(promise);
      },
    });

    const work = Promise.resolve("done");
    ctx.defer(work);

    expect(calls).toEqual([work]);
  });

  test("rejections from a caller-supplied defer route through the configured logger", async () => {
    // Bug 1 fix: the cloudflare adapter (and any other runtime that
    // wires `defer`) shouldn't have to know about logging. Whatever
    // promise the caller's `defer` receives must already carry a
    // .catch that lands in `ctx.logger.error` so an operator-wired
    // logger sees deferred rejections in production.
    const seen: { msg: string; meta?: Record<string, unknown> }[] = [];
    const captureLogger: Logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: (msg, meta) => {
        seen.push({ msg, meta });
      },
    };
    const passedThrough: Promise<unknown>[] = [];

    const ctx = createAppContext({
      db: {} as Db,
      env: {},
      request: new Request("https://x.example/"),
      hooks: new HookRegistry(),
      plugins: createPluginRegistry(),
      logger: captureLogger,
      // Mimic the cloudflare-adapter shape: a thin handler that just
      // forwards the (already-wrapped) promise. The wrap should have
      // happened inside createAppContext.
      defer: (p) => {
        passedThrough.push(p);
      },
    });

    ctx.defer(Promise.reject(new Error("boom-cf")));

    expect(passedThrough).toHaveLength(1);
    // Drain the wrapped promise's rejection handler.
    await Promise.allSettled(passedThrough);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.msg).toContain("boom-cf");
  });

  test("a logger that throws inside its error handler doesn't crash the process", async () => {
    // Bug 2 fix: defer is fire-and-forget. A misbehaving logger that
    // throws on .error() must not surface as an unhandled rejection.
    const buggyLogger: Logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => {
        throw new Error("logger backend exploded");
      },
    };
    const ctx = createAppContext({
      db: {} as Db,
      env: {},
      request: new Request("https://x.example/"),
      hooks: new HookRegistry(),
      plugins: createPluginRegistry(),
      logger: buggyLogger,
    });

    let unhandled: unknown = null;
    const trap = (event: PromiseRejectionEvent | { reason: unknown }): void => {
      unhandled = "reason" in event ? event.reason : event;
    };
    process.on("unhandledRejection", trap);
    try {
      ctx.defer(Promise.reject(new Error("rejected-task")));
      // Give the rejection chain time to settle.
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).toBeNull();
    } finally {
      process.off("unhandledRejection", trap);
    }
  });

  test("default fallback swallows rejections so plugin code never throws on `defer`", async () => {
    // Long-lived runtimes default to fire-and-forget. The promise
    // hasn't been intercepted by waitUntil; we still don't want the
    // process to crash on unhandled rejection.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow — assertion checks the captured calls.
    });
    try {
      const ctx = createAppContext({
        db: stubDb,
        env: {},
        request: new Request("https://x.example/"),
        hooks: new HookRegistry(),
        plugins: createPluginRegistry(),
      });

      ctx.defer(Promise.reject(new Error("boom")));

      // Wait one microtask tick so the rejection handler runs.
      await Promise.resolve();
      await Promise.resolve();

      expect(errorSpy).toHaveBeenCalled();
      const matched = errorSpy.mock.calls.some((args) =>
        args.some((a) => String(a).includes("boom")),
      );
      expect(matched).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
