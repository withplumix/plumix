import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import type { RegisteredScheduledTask } from "../plugin/manifest.js";
import type { PlumixApp } from "./app.js";
import { runScheduledTasks } from "./scheduled.js";

function fakeApp(tasks: RegisteredScheduledTask[]): PlumixApp {
  return { scheduledTasks: tasks } as unknown as PlumixApp;
}

function fakeCtx() {
  return {
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: vi.fn(),
    },
  } as unknown as AppContext & {
    logger: { error: ReturnType<typeof vi.fn> };
  };
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

    await runScheduledTasks(fakeApp(tasks), fakeCtx());

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
    const ctx = fakeCtx();

    await runScheduledTasks(fakeApp(tasks), ctx);

    expect(calls).toEqual(["before", "after"]);
    expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    const errorCall = ctx.logger.error.mock.calls[0];
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
    const ctx = fakeCtx();
    await runScheduledTasks(fakeApp([]), ctx);
    expect(ctx.logger.error).not.toHaveBeenCalled();
  });

  test("async rejection is caught (same path as sync throw)", async () => {
    const ctx = fakeCtx();
    const tasks: RegisteredScheduledTask[] = [
      {
        id: "async-fail",
        registeredBy: "p",
        handler: () => Promise.reject(new Error("async-boom")),
      },
    ];

    await runScheduledTasks(fakeApp(tasks), ctx);

    expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    expect(String(ctx.logger.error.mock.calls[0]?.[0])).toContain("async-boom");
  });
});
