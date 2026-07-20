import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import type { RegisteredScheduledTask } from "../plugin/manifest.js";
import type { PlumixApp } from "./app.js";
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
