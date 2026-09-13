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

const appConnecting = (connect: () => object): PlumixApp =>
  ({
    scheduledTasks: TASKS,
    schema: {},
    config: { database: { connect } },
  }) as unknown as PlumixApp;

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

    const runner = startScheduledRunner({
      app: appConnecting(connect),
      env: {},
      clock: virtualClock("2026-09-07T02:58:00Z"),
      logger: quietLogger,
      fire: () => Promise.resolve(),
    });
    await runner.stop();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  test("releases the connection it opened once stopped", async () => {
    const db: Db = await createTestDb();
    const close = vi.fn();

    const runner = startScheduledRunner({
      app: appConnecting(() => ({ db, close })),
      env: {},
      clock: virtualClock("2026-09-07T02:58:00Z"),
      logger: quietLogger,
      fire: () => Promise.resolve(),
    });
    await runner.stop();

    expect(close).toHaveBeenCalledTimes(1);
  });

  test("keeps the connection while a firing it gave up on is still running", async () => {
    const db: Db = await createTestDb();
    const close = vi.fn();
    const clock = virtualClock("2026-09-07T02:58:00Z");

    const runner = startScheduledRunner({
      app: appConnecting(() => ({ db, close })),
      env: {},
      clock,
      // No lease: its heartbeat would keep ticking for a firing that never ends.
      lease: false,
      logger: quietLogger,
      fire: () => clock.sleep(60 * 60_000),
    });
    await clock.advanceTo("2026-09-07T03:00:30Z");

    expect(await runner.stop({ timeoutMs: 10 })).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  test("releases the connection once, however often it is stopped", async () => {
    const db: Db = await createTestDb();
    const close = vi.fn();

    const runner = startScheduledRunner({
      app: appConnecting(() => ({ db, close })),
      env: {},
      clock: virtualClock("2026-09-07T02:58:00Z"),
      logger: quietLogger,
      fire: () => Promise.resolve(),
    });
    await runner.stop();
    await runner.stop();

    expect(close).toHaveBeenCalledTimes(1);
  });

  test("a connection that fails to close does not fail the stop", async () => {
    const db: Db = await createTestDb();
    const warn = vi.fn();

    const runner = startScheduledRunner({
      app: appConnecting(() => ({
        db,
        close: () => {
          throw new Error("database is not open");
        },
      })),
      env: {},
      clock: virtualClock("2026-09-07T02:58:00Z"),
      logger: { ...quietLogger, warn },
      fire: () => Promise.resolve(),
    });

    await expect(runner.stop()).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("database is not open"),
    );
  });
});
