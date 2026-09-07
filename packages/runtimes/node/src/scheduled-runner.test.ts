import type { Db, PlumixApp } from "plumix";
import { createTestDb } from "plumix/test";
import { describe, expect, test, vi } from "vitest";

import { startScheduledRunner } from "./scheduled-runner.js";
import { virtualClock } from "./test/virtual-clock.js";

const TASKS = [
  { id: "publish-scheduled", cron: "*/5 * * * *", registeredBy: "core" },
];

const appWith = (tasks: readonly unknown[] = TASKS): PlumixApp =>
  ({ scheduledTasks: tasks }) as unknown as PlumixApp;

const quietLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("startScheduledRunner", () => {
  // Two runners over one database are two replicas of a deploy pointed at one
  // Turso — the configuration `plumix/db/libsql` makes possible today.
  test("lets only one replica fire a given minute", async () => {
    const db: Db = await createTestDb();
    const fired: { replica: string; at: number }[] = [];
    const clock = virtualClock("2026-09-07T02:58:00Z");

    const replicas = ["a", "b"].map((replica) =>
      startScheduledRunner({
        app: appWith(),
        env: {},
        db,
        clock,
        logger: quietLogger,
        fire: (_cron, at) => Promise.resolve(void fired.push({ replica, at })),
      }),
    );

    await clock.advanceTo("2026-09-07T03:20:30Z");
    await Promise.all(replicas.map((r) => r.stop()));

    // 03:00, 03:05, 03:10, 03:15, 03:20 — each fired once across both replicas.
    const minutes = fired.map((f) => f.at);
    expect(new Set(minutes).size).toBe(minutes.length);
    expect(minutes).toHaveLength(5);
  });

  test("without the lease, a replica still cannot repeat another's minute", async () => {
    // What `plumix dev` runs. The claim row is crash-proof and carries the
    // at-most-once-per-minute half on its own.
    const db: Db = await createTestDb();
    const fired: number[] = [];
    const clock = virtualClock("2026-09-07T02:58:00Z");

    const replicas = ["a", "b"].map(() =>
      startScheduledRunner({
        app: appWith(),
        env: {},
        db,
        clock,
        lease: false,
        logger: quietLogger,
        fire: (_cron, at) => Promise.resolve(void fired.push(at)),
      }),
    );

    await clock.advanceTo("2026-09-07T03:10:30Z");
    await Promise.all(replicas.map((r) => r.stop()));

    expect(new Set(fired).size).toBe(fired.length);
  });

  test("connects the site's own database when none is handed in", async () => {
    const db: Db = await createTestDb();
    const connect = vi.fn(() => ({ db }));
    const app = {
      scheduledTasks: TASKS,
      schema: {},
      config: { database: { connect } },
    } as unknown as PlumixApp;

    const runner = startScheduledRunner({
      app,
      env: {},
      clock: virtualClock("2026-09-07T02:58:00Z"),
      logger: quietLogger,
      fire: () => Promise.resolve(),
    });
    await runner.stop();

    expect(connect).toHaveBeenCalledTimes(1);
  });
});
