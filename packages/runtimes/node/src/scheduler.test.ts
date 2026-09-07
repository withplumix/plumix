import type { PlumixApp } from "plumix";
import { describe, expect, test, vi } from "vitest";

import { createScheduler } from "./scheduler.js";
import { virtualClock } from "./test/virtual-clock.js";

// The real roster: core's two, a plugin's, and one that declares no cron and so
// runs on every firing.
const TASKS = [
  { id: "session-cleanup", cron: "0 3 * * *", registeredBy: "core" },
  { id: "publish-scheduled", cron: "*/5 * * * *", registeredBy: "core" },
  { id: "retention-purge", cron: "30 4 * * *", registeredBy: "audit-log" },
  { id: "index-drain", registeredBy: "search" },
];

const appWith = (tasks: readonly unknown[]): PlumixApp =>
  ({ scheduledTasks: tasks }) as unknown as PlumixApp;

function harness(
  tasks: readonly unknown[],
  overrides: { fire?: (cron: string, at: number) => Promise<void> } = {},
) {
  const clock = virtualClock("2026-09-07T02:58:00Z");
  const fired: { cron: string; at: number }[] = [];
  const warn = vi.fn();
  const scheduler = createScheduler({
    app: appWith(tasks),
    clock,
    logger: { info: vi.fn(), warn, error: vi.fn() },
    fire: async (cron, at) => {
      fired.push({ cron, at });
      await overrides.fire?.(cron, at);
    },
  });
  return { clock, fired, warn, scheduler };
}

describe("createScheduler", () => {
  test("fires each declared schedule on its own minute, and only then", async () => {
    const { clock, fired, scheduler } = harness(TASKS);
    void scheduler.start();
    await clock.advanceTo("2026-09-08T02:58:00Z");
    await scheduler.stop();

    const counts = new Map<string, number>();
    for (const f of fired) counts.set(f.cron, (counts.get(f.cron) ?? 0) + 1);

    expect(counts.get("*/5 * * * *")).toBe(288); // every 5 minutes for a day
    expect(counts.get("0 3 * * *")).toBe(1);
    expect(counts.get("30 4 * * *")).toBe(1);
  });

  test("fires colliding schedules separately, as Cloudflare does", async () => {
    // 03:00 satisfies both `0 3 * * *` and `*/5 * * * *`. Each trigger is its
    // own firing, so a task with no cron legitimately runs on both.
    const { clock, fired, scheduler } = harness(TASKS);
    void scheduler.start();
    await clock.advanceTo("2026-09-07T03:00:30Z");
    await scheduler.stop();

    const atThree = fired.filter(
      (f) => f.at === Date.parse("2026-09-07T03:00:00Z"),
    );
    expect(atThree.map((f) => f.cron).sort()).toEqual([
      "*/5 * * * *",
      "0 3 * * *",
    ]);
  });

  test("fires a heartbeat when every task declared no cron", async () => {
    // Nothing to derive a schedule from, but there is still work to run.
    const { clock, fired, scheduler } = harness([
      { id: "index-drain", registeredBy: "search" },
    ]);
    void scheduler.start();
    await clock.advanceTo("2026-09-07T03:01:30Z");
    await scheduler.stop();

    expect(fired.map((f) => f.cron)).toEqual([
      "* * * * *",
      "* * * * *",
      "* * * * *",
    ]);
  });

  test("starts nothing when the site declares no scheduled tasks at all", async () => {
    const { clock, fired, scheduler } = harness([]);
    void scheduler.start();
    await clock.advanceTo("2026-09-07T04:00:00Z");
    await scheduler.stop();

    expect(fired).toEqual([]);
  });

  test("never overlaps itself: a run longer than its schedule skips minutes", async () => {
    let concurrent = 0;
    let peak = 0;
    const { clock, fired, scheduler, warn } = harness(
      [{ id: "slow", cron: "*/5 * * * *", registeredBy: "demo" }],
      {
        fire: async () => {
          concurrent++;
          peak = Math.max(peak, concurrent);
          await clock.sleep(12 * 60_000);
          concurrent--;
        },
      },
    );
    void scheduler.start();
    await clock.advanceTo("2026-09-07T04:00:00Z");
    const stopping = scheduler.stop();
    await clock.advanceTo("2026-09-07T05:00:00Z");
    await stopping;

    expect(peak).toBe(1);
    // Minutes lost to the long run are reported, not silently swallowed.
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/missed/i));
    expect(fired.length).toBeGreaterThan(1);
  });

  test("does not replay minutes missed while the process was suspended", async () => {
    const { clock, fired, scheduler, warn } = harness([
      { id: "publish", cron: "*/5 * * * *", registeredBy: "core" },
    ]);
    void scheduler.start();
    await clock.advanceTo("2026-09-07T03:00:30Z");
    const beforeSuspend = fired.length;

    // The laptop slept for two hours. A catch-up here would fire 24 times.
    clock.suspend(2 * 60 * 60_000);
    await clock.advanceTo("2026-09-07T05:02:30Z");
    await scheduler.stop();

    expect(fired.length - beforeSuspend).toBeLessThanOrEqual(2);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/missed/i));
  });

  test("keeps firing after a firing throws", async () => {
    let calls = 0;
    const { clock, fired, scheduler } = harness(
      [{ id: "flaky", cron: "*/5 * * * *", registeredBy: "demo" }],
      {
        fire: () => {
          calls++;
          return calls === 1
            ? Promise.reject(new Error("boom"))
            : Promise.resolve();
        },
      },
    );
    void scheduler.start();
    await clock.advanceTo("2026-09-07T03:20:00Z");
    await scheduler.stop();

    expect(fired.length).toBeGreaterThan(1);
  });

  test("stop() waits for the run in flight and schedules nothing after it", async () => {
    let finished = false;
    const { clock, fired, scheduler } = harness(
      [{ id: "slow", cron: "*/5 * * * *", registeredBy: "demo" }],
      {
        fire: async () => {
          await clock.sleep(90_000);
          finished = true;
        },
      },
    );
    void scheduler.start();
    await clock.advanceTo("2026-09-07T03:00:10Z");
    expect(finished).toBe(false);

    const stopping = scheduler.stop();
    await clock.advanceTo("2026-09-07T03:30:00Z");
    await stopping;

    // The half-run firing completed, and nothing new started behind it.
    expect(finished).toBe(true);
    expect(fired).toHaveLength(1);
  });
});

describe("createScheduler with a run guard", () => {
  test("skips a firing the guard refuses, and keeps going", async () => {
    const outcomes = ["claimed", "leased", "ran"] as const;
    let call = 0;
    const clock = virtualClock("2026-09-07T02:58:00Z");
    const ran: string[] = [];
    const scheduler = createScheduler({
      app: appWith([
        { id: "publish", cron: "*/5 * * * *", registeredBy: "core" },
      ]),
      clock,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      fire: (cron) => Promise.resolve(void ran.push(cron)),
      guard: {
        run: async (
          _schedule: string,
          _minute: number,
          work: () => unknown,
        ) => {
          const outcome =
            outcomes[Math.min(call++, outcomes.length - 1)] ?? "ran";
          if (outcome === "ran") await work();
          return outcome;
        },
      },
    });

    void scheduler.start();
    await clock.advanceTo("2026-09-07T03:20:00Z");
    await scheduler.stop();

    // Refused twice, then allowed — the work runs only when the guard says so.
    expect(call).toBeGreaterThanOrEqual(3);
    expect(ran.length).toBe(call - 2);
  });

  test("hands the guard the minute, so two replicas agree on the key", async () => {
    const seen: number[] = [];
    const clock = virtualClock("2026-09-07T02:58:00Z");
    const scheduler = createScheduler({
      app: appWith([
        { id: "publish", cron: "*/5 * * * *", registeredBy: "core" },
      ]),
      clock,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      fire: () => Promise.resolve(),
      guard: {
        run: async (_schedule: string, minute: number, work: () => unknown) => {
          seen.push(minute);
          await work();
          return "ran";
        },
      },
    });

    void scheduler.start();
    await clock.advanceTo("2026-09-07T03:10:30Z");
    await scheduler.stop();

    expect(seen[0]).toBe(Date.parse("2026-09-07T03:00:00Z") / 60_000);
    expect(seen[1]).toBe(Date.parse("2026-09-07T03:05:00Z") / 60_000);
  });
});
