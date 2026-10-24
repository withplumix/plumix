import { getEventListeners } from "node:events";
import { beforeAll, describe, expect, onTestFinished, test, vi } from "vitest";

import type { Db } from "../context/app-context.js";
import type { TelemetrySnapshot } from "../context/telemetry.js";
import type { RegisteredScheduledTask } from "../plugin/manifest.js";
import type { PlumixApp } from "./app.js";
import { createAppContext, withSignal } from "../context/app.js";
import { testConfig } from "../test/config.js";
import { createTestContext, silentLogger } from "../test/context.js";
import { createDeferQueue } from "../test/defer.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createTestDb } from "../test/harness.js";
import { runScheduledTasks } from "./scheduled.js";

function fakeApp(
  tasks: RegisteredScheduledTask[],
): Pick<PlumixApp, "scheduledTasks"> {
  return { scheduledTasks: tasks };
}

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

/**
 * A standalone `error` handle, because reading the method back off
 * `ctx.logger` trips `unbound-method`.
 */
function fakeCtx() {
  const error = vi.fn();
  const ctx = createTestContext({ db, logger: { ...silentLogger, error } });
  return { ctx, error };
}

describe("runScheduledTasks", () => {
  test("runs every registered task in declared order", async () => {
    const calls: string[] = [];
    const tasks: RegisteredScheduledTask[] = [
      {
        id: "a",
        registeredBy: "plugin-x",
        handler: () => {
          calls.push("a");
        },
      },
      {
        id: "b",
        registeredBy: "plugin-y",
        handler: async () => {
          await Promise.resolve();
          calls.push("b");
        },
      },
      {
        id: "c",
        registeredBy: "plugin-y",
        handler: () => {
          calls.push("c");
        },
      },
    ];

    await runScheduledTasks(fakeApp(tasks), fakeCtx().ctx);

    expect(calls).toEqual(["a", "b", "c"]);
  });

  test("a failing task does not abort siblings — error logged, others run", async () => {
    const calls: string[] = [];
    const boom = new Error("boom");
    const tasks: RegisteredScheduledTask[] = [
      {
        id: "before",
        registeredBy: "p",
        handler: () => {
          calls.push("before");
        },
      },
      {
        id: "failing",
        registeredBy: "p",
        cron: "0 3 * * *",
        handler: () => {
          throw boom;
        },
      },
      {
        id: "after",
        registeredBy: "p",
        handler: () => {
          calls.push("after");
        },
      },
    ];
    const { ctx, error } = fakeCtx();

    await runScheduledTasks(fakeApp(tasks), ctx);

    expect(calls).toEqual(["before", "after"]);
    expect(error).toHaveBeenCalledTimes(1);
    const errorCall = error.mock.calls[0];
    expect(String(errorCall?.[0])).toContain("p:failing");
    expect(String(errorCall?.[0])).toContain("boom");
    expect(errorCall?.[1]).toMatchObject({
      taskId: "failing",
      plugin: "p",
      cron: "0 3 * * *",
      error: boom,
    });
  });

  test("a logger that throws does not cost the run its accounting", async () => {
    // The sink runs only after a task failed, so letting it throw would
    // discard every task's work and the report.
    const tasks: RegisteredScheduledTask[] = [
      { id: "ok", registeredBy: "p", handler: () => undefined },
      {
        id: "failing",
        registeredBy: "p",
        handler: () => {
          throw new Error("boom");
        },
      },
    ];
    const ctx = createTestContext({
      db,
      logger: {
        ...silentLogger,
        error: () => {
          throw new Error("transport down");
        },
      },
    });

    await expect(runScheduledTasks(fakeApp(tasks), ctx)).resolves.toStrictEqual(
      { ran: 1, failed: ["p:failing"], timedOut: [] },
    );
  });

  test("empty task list is a no-op (no logger calls)", async () => {
    const { ctx, error } = fakeCtx();
    await runScheduledTasks(fakeApp([]), ctx);
    expect(error).not.toHaveBeenCalled();
  });

  test("async rejection is caught (same path as sync throw)", async () => {
    const { ctx, error } = fakeCtx();
    const tasks: RegisteredScheduledTask[] = [
      {
        id: "async-fail",
        registeredBy: "p",
        handler: () => Promise.reject(new Error("async-boom")),
      },
    ];

    await runScheduledTasks(fakeApp(tasks), ctx);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("async-boom");
  });

  test("with a fired cron, runs only matching-cron tasks plus untagged ones", async () => {
    const calls: string[] = [];
    const tasks: RegisteredScheduledTask[] = [
      {
        id: "daily",
        registeredBy: "p",
        cron: "0 3 * * *",
        handler: () => {
          calls.push("daily");
        },
      },
      {
        id: "frequent",
        registeredBy: "p",
        cron: "*/5 * * * *",
        handler: () => {
          calls.push("frequent");
        },
      },
      {
        id: "always",
        registeredBy: "p",
        handler: () => {
          calls.push("always");
        },
      },
    ];

    await runScheduledTasks(fakeApp(tasks), fakeCtx().ctx, "0 3 * * *");

    expect(calls).toEqual(["daily", "always"]);
  });

  test("task runs are traced: cron spans reach a registered consumer through the same collector", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const harness = await createDispatcherHarness();
    const { defer, drainDeferred } = createDeferQueue();
    const silent = () => undefined;
    const ctx = createAppContext({
      db: harness.db,
      env: harness.env,
      request: new Request(
        "https://cms.example/_plumix/internal/scheduled?cron=0+3+*+*+*",
        { method: "POST" },
      ),
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
      defer,
      logger: { debug: silent, info: silent, warn: silent, error: silent },
      config: testConfig({
        telemetry: {
          consumers: [
            { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
          ],
        },
      }),
    });
    const tasks: RegisteredScheduledTask[] = [
      {
        id: "cleanup",
        registeredBy: "plugin-x",
        cron: "0 3 * * *",
        handler: () => undefined,
      },
      {
        id: "failing",
        registeredBy: "plugin-y",
        handler: () => {
          throw new Error("task boom");
        },
      },
    ];

    await runScheduledTasks(fakeApp(tasks), ctx);
    await drainDeferred();

    expect(snapshots).toHaveLength(1);
    const [snapshot] = snapshots;
    expect(snapshot?.request.method).toBe("POST");
    expect(snapshot?.request.url).toContain("/_plumix/internal/scheduled");
    const cleanup = snapshot?.spans.find((s) => s.name === "cron: cleanup");
    expect(cleanup?.status).toBe("ok");
    expect(cleanup?.attributes).toEqual({
      "cron.plugin": "plugin-x",
      "cron.schedule": "0 3 * * *",
    });
    const failing = snapshot?.spans.find((s) => s.name === "cron: failing");
    expect(failing?.status).toBe("error");
    expect(failing?.error?.message).toBe("task boom");
  });

  test("with no fired cron, runs every task regardless of declared cron", async () => {
    const calls: string[] = [];
    const tasks: RegisteredScheduledTask[] = [
      {
        id: "daily",
        registeredBy: "p",
        cron: "0 3 * * *",
        handler: () => {
          calls.push("daily");
        },
      },
      {
        id: "always",
        registeredBy: "p",
        handler: () => {
          calls.push("always");
        },
      },
    ];

    await runScheduledTasks(fakeApp(tasks), fakeCtx().ctx);

    expect(calls).toEqual(["daily", "always"]);
  });
});

describe("runScheduledTasks — reporting what happened", () => {
  test("reports which tasks ran and which failed", async () => {
    // A caller firing cron from outside — `plumix cron run`, driven by a
    // CronJob — has no other way to tell a run where everything worked from one
    // where nothing did.
    const { ctx } = fakeCtx();
    const app = fakeApp([
      { id: "ok", registeredBy: "core", handler: () => undefined },
      {
        id: "boom",
        registeredBy: "reports",
        handler: () => {
          throw new Error("nope");
        },
      },
    ]);

    const report = await runScheduledTasks(app, ctx);

    expect(report.ran).toBe(1);
    expect(report.failed).toEqual(["reports:boom"]);
  });

  test("reports an empty failure list when every task worked", async () => {
    const { ctx } = fakeCtx();
    const app = fakeApp([
      { id: "ok", registeredBy: "core", handler: () => undefined },
    ]);

    const report = await runScheduledTasks(app, ctx);

    expect(report).toEqual({ ran: 1, failed: [], timedOut: [] });
  });
});

describe("runScheduledTasks — a task's time budget", () => {
  // Never settles, as a task stuck on an upstream that never answers.
  const hang = (): Promise<void> => new Promise<void>(() => undefined);

  test("a task that never settles times out after the 5-minute default, and the next task still runs", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const calls: string[] = [];
    const app = fakeApp([
      { id: "stuck", registeredBy: "p", handler: hang },
      {
        id: "next",
        registeredBy: "p",
        handler: () => {
          calls.push("next");
        },
      },
    ]);

    const run = runScheduledTasks(app, fakeCtx().ctx);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    await expect(run).resolves.toStrictEqual({
      ran: 1,
      failed: [],
      timedOut: ["p:stuck"],
    });
    expect(calls).toEqual(["next"]);
  });

  test("a task that declares a budget times out after it instead", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const app = fakeApp([
      { id: "stuck", registeredBy: "p", timeoutMs: 1_500, handler: hang },
    ]);

    const run = runScheduledTasks(app, fakeCtx().ctx);
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(run).resolves.toStrictEqual({
      ran: 0,
      failed: [],
      timedOut: ["p:stuck"],
    });
  });

  test("the budget aborts the task's ctx.signal with a TimeoutError, and a ctx.fetch in flight rejects", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    // Rejects with its signal's reason once it aborts, the way the platform
    // `fetch` does.
    vi.stubGlobal(
      "fetch",
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        await new Promise((resolve) => {
          init?.signal?.addEventListener("abort", resolve, { once: true });
        });
        init?.signal?.throwIfAborted();
        return new Response("unreachable");
      },
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    let signal: AbortSignal | undefined;
    let fetched: Promise<unknown> | undefined;
    const app = fakeApp([
      {
        id: "stuck",
        registeredBy: "p",
        timeoutMs: 1_000,
        handler: (ctx) => {
          signal = ctx.signal;
          fetched = ctx.fetch("https://slow.example/").catch((e: unknown) => e);
          return hang();
        },
      },
    ]);

    const run = runScheduledTasks(app, fakeCtx().ctx);
    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await run;

    expect(signal?.reason).toBeInstanceOf(DOMException);
    expect(signal?.reason).toMatchObject({
      name: "TimeoutError",
      cause: "timeout",
    });
    await expect(fetched).resolves.toBe(signal?.reason);
  });

  test("a task that throws an AbortError of its own failed, it did not time out", async () => {
    const app = fakeApp([
      {
        id: "cancelled",
        registeredBy: "p",
        handler: () => {
          throw new DOMException("upstream gave up", "AbortError");
        },
      },
    ]);

    await expect(runScheduledTasks(app, fakeCtx().ctx)).resolves.toStrictEqual({
      ran: 0,
      failed: ["p:cancelled"],
      timedOut: [],
    });
  });

  test("a task that rejects with its signal's reason when the budget runs out timed out", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const app = fakeApp([
      {
        id: "stops",
        registeredBy: "p",
        timeoutMs: 1_000,
        handler: (ctx) =>
          new Promise<void>((_resolve, reject) => {
            ctx.signal.addEventListener("abort", () => {
              reject(ctx.signal.reason as Error);
            });
          }),
      },
    ]);
    const { ctx, error } = fakeCtx();

    const run = runScheduledTasks(app, ctx);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(run).resolves.toStrictEqual({
      ran: 0,
      failed: [],
      timedOut: ["p:stops"],
    });
    expect(error).not.toHaveBeenCalled();
  });

  test("a timeout is a warning, not an error, and its span ends cancelled", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const snapshots: TelemetrySnapshot[] = [];
    const warn = vi.fn();
    const error = vi.fn();
    const ctx = createTestContext({
      db,
      logger: { ...silentLogger, warn, error },
      config: {
        telemetry: {
          consumers: [
            { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
          ],
        },
      },
    });
    const app = fakeApp([
      {
        id: "stuck",
        registeredBy: "p",
        cron: "0 3 * * *",
        timeoutMs: 90_000,
        handler: hang,
      },
    ]);

    const run = runScheduledTasks(app, ctx);
    await vi.advanceTimersByTimeAsync(90_000);
    await run;

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      `[plumix] scheduled task "p:stuck" timed out after 90s`,
      { taskId: "stuck", plugin: "p", cron: "0 3 * * *", timeoutMs: 90_000 },
    );
    const span = snapshots[0]?.spans.find((s) => s.name === "cron: stuck");
    expect(span).toMatchObject({
      status: "cancelled",
      message: "timed out after 90s",
    });
    expect(span?.error).toBeUndefined();
  });

  test("a shutdown aborts the task's ctx.signal with its reason, and its span and log say it was shut down", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const warn = vi.fn();
    const error = vi.fn();
    const shutdown = new AbortController();
    const ctx = createTestContext({
      db,
      logger: { ...silentLogger, warn, error },
      config: {
        telemetry: {
          consumers: [
            { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
          ],
        },
      },
    });
    let signal: AbortSignal | undefined;
    const app = fakeApp([
      {
        id: "stuck",
        registeredBy: "p",
        cron: "0 3 * * *",
        handler: (taskCtx) => {
          signal = taskCtx.signal;
          return hang();
        },
      },
    ]);
    const reason = Object.assign(new DOMException("shut down", "AbortError"), {
      cause: "shutdown",
    });

    const run = runScheduledTasks(app, withSignal(ctx, shutdown.signal));
    shutdown.abort(reason);

    await expect(run).resolves.toStrictEqual({
      ran: 0,
      failed: [],
      timedOut: ["p:stuck"],
    });
    expect(signal?.reason).toBe(reason);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      `[plumix] scheduled task "p:stuck" shut down`,
      { taskId: "stuck", plugin: "p", cron: "0 3 * * *" },
    );
    const span = snapshots[0]?.spans.find((s) => s.name === "cron: stuck");
    expect(span).toMatchObject({ status: "cancelled", message: "shut down" });
  });

  test("a task that rejects with its signal's reason on shutdown was shut down, it did not fail", async () => {
    const shutdown = new AbortController();
    const app = fakeApp([
      {
        id: "stops",
        registeredBy: "p",
        handler: (taskCtx) =>
          new Promise<void>((_resolve, reject) => {
            taskCtx.signal.addEventListener("abort", () => {
              reject(taskCtx.signal.reason as Error);
            });
          }),
      },
    ]);
    const { ctx, error } = fakeCtx();

    const run = runScheduledTasks(app, withSignal(ctx, shutdown.signal));
    shutdown.abort(new DOMException("shut down", "AbortError"));

    await expect(run).resolves.toStrictEqual({
      ran: 0,
      failed: [],
      timedOut: ["p:stops"],
    });
    expect(error).not.toHaveBeenCalled();
  });

  test("a task started after the shutdown is reported shut down without waiting", async () => {
    const shutdown = new AbortController();
    shutdown.abort(new DOMException("shut down", "AbortError"));
    const app = fakeApp([
      { id: "late", registeredBy: "p", handler: () => hang() },
    ]);
    const { ctx } = fakeCtx();

    await expect(
      runScheduledTasks(app, withSignal(ctx, shutdown.signal)),
    ).resolves.toStrictEqual({ ran: 0, failed: [], timedOut: ["p:late"] });
  });

  test("a finished task leaves no listener on the shutdown signal", async () => {
    const shutdown = new AbortController();
    const app = fakeApp([
      { id: "a", registeredBy: "p", handler: () => undefined },
      { id: "b", registeredBy: "p", handler: () => undefined },
    ]);
    const { ctx } = fakeCtx();

    await runScheduledTasks(app, withSignal(ctx, shutdown.signal));

    expect(getEventListeners(shutdown.signal, "abort")).toHaveLength(0);
  });
});
