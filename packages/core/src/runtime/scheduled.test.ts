import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import type { TelemetrySnapshot } from "../context/telemetry.js";
import type { RegisteredScheduledTask } from "../plugin/manifest.js";
import type { PlumixApp } from "./app.js";
import { createAppContext } from "../context/app.js";
import { NOOP_TELEMETRY } from "../context/telemetry.js";
import { createDeferQueue } from "../test/defer.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { runScheduledTasks } from "./scheduled.js";

function fakeApp(tasks: RegisteredScheduledTask[]): PlumixApp {
  return { scheduledTasks: tasks } as unknown as PlumixApp;
}

// Returns the context alongside the `error` spy as a standalone handle. Asserting
// on the handle rather than `ctx.logger.error` keeps `unbound-method` happy —
// `AppContext.logger.error` is a method type, so reading it back off the object
// reads as an unbound method reference.
function fakeCtx() {
  const error = vi.fn();
  const ctx = {
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error,
    },
    telemetry: NOOP_TELEMETRY,
  } as unknown as AppContext;
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
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
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
