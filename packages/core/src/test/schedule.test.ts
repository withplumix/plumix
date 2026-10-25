import { describe, expect, test } from "vitest";

import type { RegisteredScheduledTask } from "../plugin/registry.js";
import { findTask, scheduleOf, TestRunReport } from "./schedule.js";

function task(
  registeredBy: string,
  id: string,
  cron?: string,
): RegisteredScheduledTask {
  return { registeredBy, id, cron, handler: () => undefined };
}

const nightly = task("forms", "retention-purge", "0 3 * * *");
const everyFiring = task("audit", "heartbeat");

describe("TestRunReport", () => {
  const report = new TestRunReport({
    ran: ["forms:retention-purge"],
    failed: ["audit:rotate"],
    timedOut: ["seo:crawl"],
  });

  test("passes for a task in the list it asserts", () => {
    expect(() => {
      report
        .assertRan("forms:retention-purge")
        .assertFailed("audit:rotate")
        .assertTimedOut("seo:crawl");
    }).not.toThrow();
  });

  test("says a task that failed did not run", () => {
    expect(() => report.assertRan("audit:rotate")).toThrow(
      'assertRan: expected "audit:rotate" to have run, but it failed.\n' +
        'ran: "forms:retention-purge"; failed: "audit:rotate"; timed out: "seo:crawl"',
    );
  });

  test("says a task that ran did not fail", () => {
    expect(() => report.assertFailed("forms:retention-purge")).toThrow(
      'assertFailed: expected "forms:retention-purge" to have failed, but it ran.',
    );
  });

  test("says a task that failed did not time out", () => {
    expect(() => report.assertTimedOut("audit:rotate")).toThrow(
      'assertTimedOut: expected "audit:rotate" to have timed out, but it failed.',
    );
  });

  test("says a task that timed out did not run", () => {
    expect(() => report.assertRan("seo:crawl")).toThrow(
      'assertRan: expected "seo:crawl" to have run, but it timed out.',
    );
  });

  test("says the firing did not select a task it never saw", () => {
    expect(() => report.assertRan("seo:other")).toThrow(
      'assertRan: expected "seo:other" to have run, but the firing did not select it.',
    );
  });

  test("says nothing ran when a firing selected no task", () => {
    const empty = new TestRunReport({ ran: [], failed: [], timedOut: [] });

    expect(() => empty.assertRan("forms:retention-purge")).toThrow(
      "ran: none; failed: none; timed out: none",
    );
  });
});

describe("assertScheduled", () => {
  const schedule = scheduleOf([nightly, everyFiring]);

  test("passes for a task on that cron", () => {
    expect(() => {
      schedule.assertScheduled("forms:retention-purge", "0 3 * * *");
    }).not.toThrow();
  });

  test("fails naming the cron a task is on instead", () => {
    expect(() => {
      schedule.assertScheduled("forms:retention-purge", "0 4 * * *");
    }).toThrow(
      'assertScheduled: expected "forms:retention-purge" on "0 4 * * *", but it is on "0 3 * * *".',
    );
  });

  test("fails for a task that declares no cron", () => {
    expect(() => {
      schedule.assertScheduled("audit:heartbeat", "0 3 * * *");
    }).toThrow(
      'assertScheduled: expected "audit:heartbeat" on "0 3 * * *", but it declares no cron and runs on every firing.',
    );
  });

  test("fails listing the registered tasks for an unknown id", () => {
    expect(() => {
      schedule.assertScheduled("forms:other", "0 3 * * *");
    }).toThrow(
      'assertScheduled: no scheduled task "forms:other". Registered: "forms:retention-purge", "audit:heartbeat".',
    );
  });
});

describe("findTask", () => {
  test("finds a task by its plugin and task id", () => {
    expect(findTask([nightly, everyFiring], "audit:heartbeat", "runTask")).toBe(
      everyFiring,
    );
  });

  test("says nothing is registered when the site has no task", () => {
    expect(() => findTask([], "forms:retention-purge", "runTask")).toThrow(
      'runTask: no scheduled task "forms:retention-purge". Registered: none.',
    );
  });
});
