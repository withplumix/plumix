import { describe, expect, test, vi } from "vitest";

import type { Db } from "../context/app.js";
import { createTestDb } from "../test/harness.js";
import { createScheduledRunGuard } from "./scheduled-guard.js";

// Two guards over one database stand in for two replicas of a deploy sharing
// one database — the configuration `plumix/db/libsql` makes possible today.
function replicas(db: Db, options: { lease?: boolean } = {}) {
  const make = (holder: string) =>
    createScheduledRunGuard({
      db,
      holder,
      lease: options.lease ?? true,
      ttlMs: 60_000,
    });
  return { a: make("replica-a"), b: make("replica-b") };
}

const MINUTE = 29_000_000;

/** Work that succeeds immediately; a bare `async () => {}` trips lint. */
const noWork = (): Promise<void> => Promise.resolve();

/** Work that never settles — the process was killed mid-run. */
const neverFinishes = (): Promise<void> => new Promise<void>(() => undefined);

describe("createScheduledRunGuard", () => {
  test("runs the work and reports that it ran", async () => {
    const { a } = replicas(await createTestDb());
    const work = vi.fn(noWork);

    await expect(a.run("*/5 * * * *", MINUTE, work)).resolves.toBe("ran");
    expect(work).toHaveBeenCalledTimes(1);
  });

  test("lets only one replica run a given schedule's minute", async () => {
    const { a, b } = replicas(await createTestDb());
    const ranA = vi.fn(noWork);
    const ranB = vi.fn(noWork);

    await a.run("*/5 * * * *", MINUTE, ranA);
    await expect(b.run("*/5 * * * *", MINUTE, ranB)).resolves.toBe("claimed");

    expect(ranA).toHaveBeenCalledTimes(1);
    expect(ranB).not.toHaveBeenCalled();
  });

  test("keeps each schedule's claim separate", async () => {
    const { a } = replicas(await createTestDb());
    await a.run("*/5 * * * *", MINUTE, noWork);

    // A different schedule at the same minute is different work.
    await expect(a.run("0 3 * * *", MINUTE, noWork)).resolves.toBe("ran");
  });

  test("never replays a minute already run, even one long past", async () => {
    const { a } = replicas(await createTestDb());
    await a.run("*/5 * * * *", MINUTE, noWork);

    await expect(a.run("*/5 * * * *", MINUTE - 1, noWork)).resolves.toBe(
      "claimed",
    );
    await expect(a.run("*/5 * * * *", MINUTE + 1, noWork)).resolves.toBe("ran");
  });

  test("holds the lease against a later minute while a run is still working", async () => {
    // The case the claim row cannot catch: replica A is still working minute
    // N when replica B reaches minute N+1. Different claim key, same task.
    const { a, b } = replicas(await createTestDb());
    let releaseA: () => void = () => undefined;
    const aWorking = new Promise<void>((resolve) => (releaseA = resolve));

    const runA = a.run("*/5 * * * *", MINUTE, () => aWorking);
    // Give A's claim and lease writes a turn before B tries.
    await vi.waitFor(async () => {
      await expect(b.run("*/5 * * * *", MINUTE + 1, noWork)).resolves.toBe(
        "leased",
      );
    });

    releaseA();
    await expect(runA).resolves.toBe("ran");

    // Once A is done the lease is free again.
    await expect(b.run("*/5 * * * *", MINUTE + 2, noWork)).resolves.toBe("ran");
  });

  test("releases the lease when the work throws, and lets the failure out", async () => {
    const { a, b } = replicas(await createTestDb());
    const boom = new Error("task exploded");

    await expect(
      a.run("*/5 * * * *", MINUTE, () => Promise.reject(boom)),
    ).rejects.toThrow(boom);

    // A wedged lease here would stop every later run on every replica.
    await expect(b.run("*/5 * * * *", MINUTE + 1, noWork)).resolves.toBe("ran");
  });

  test("takes over a lease whose holder died, once it lapses", async () => {
    const db = await createTestDb();
    const dead = createScheduledRunGuard({
      db,
      holder: "killed",
      lease: true,
      ttlMs: 60_000,
    });
    const successor = createScheduledRunGuard({
      db,
      holder: "successor",
      lease: true,
      ttlMs: 60_000,
    });

    // A holder that never releases: the process was killed mid-run.
    void dead.run("*/5 * * * *", MINUTE, neverFinishes);
    await vi.waitFor(async () => {
      await expect(
        successor.run("*/5 * * * *", MINUTE + 1, noWork),
      ).resolves.toBe("leased");
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61_000);
      await expect(
        successor.run("*/5 * * * *", MINUTE + 2, noWork),
      ).resolves.toBe("ran");
    } finally {
      vi.useRealTimers();
    }
  });

  test("skips the lease entirely when it is turned off", async () => {
    // What `plumix dev` runs: one process, so the claim is guard enough, and a
    // minutes-long TTL would outlive a process that restarts every few seconds.
    const { a, b } = replicas(await createTestDb(), { lease: false });
    void a.run("*/5 * * * *", MINUTE, neverFinishes);

    await expect(b.run("*/5 * * * *", MINUTE + 1, noWork)).resolves.toBe("ran");
  });
});

describe("createScheduledRunGuard — a run that legitimately runs long", () => {
  test("keeps its lease past the TTL while it is still working", async () => {
    // The TTL is what frees a lease whose holder died, so it is sized above any
    // plausible run. A run that outlives it anyway — a big purge batching
    // async deletes — must not have the lease taken out from under it.
    const db = await createTestDb();
    const holder = createScheduledRunGuard({
      db,
      holder: "worker",
      lease: true,
      ttlMs: 60,
    });
    const other = createScheduledRunGuard({
      db,
      holder: "other",
      lease: true,
      ttlMs: 60,
    });

    let done = false;
    const running = holder.run("*/5 * * * *", MINUTE, async () => {
      // Yields repeatedly, as real async database work does.
      for (let i = 0; i < 12; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      done = true;
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 180));
    expect(done).toBe(false);
    await expect(other.run("*/5 * * * *", MINUTE + 1, noWork)).resolves.toBe(
      "leased",
    );

    await expect(running).resolves.toBe("ran");
  });
});

describe("createScheduledRunGuard — a firing that loses the lease", () => {
  test("does not burn the minute, so the schedule is not lost", async () => {
    // The claim is taken only once the lease is held. Claiming first would
    // mark the minute done for a firing that never ran — and a schedule that
    // matches once a day would skip the whole day.
    const db = await createTestDb();
    const busy = createScheduledRunGuard({
      db,
      holder: "busy",
      lease: true,
      ttlMs: 60_000,
    });
    const daily = createScheduledRunGuard({
      db,
      holder: "daily",
      lease: true,
      ttlMs: 60_000,
    });

    let release: () => void = () => undefined;
    const working = new Promise<void>((resolve) => (release = resolve));
    const slow = busy.run("*/5 * * * *", MINUTE, () => working);
    await vi.waitFor(async () => {
      await expect(daily.run("0 3 * * *", MINUTE, noWork)).resolves.toBe(
        "leased",
      );
    });

    release();
    await expect(slow).resolves.toBe("ran");

    let dailyRan = false;
    await expect(
      daily.run("0 3 * * *", MINUTE, () => {
        dailyRan = true;
        return Promise.resolve();
      }),
    ).resolves.toBe("ran");
    expect(dailyRan).toBe(true);
  });

  test("gives each schedule its own lease when told to", async () => {
    // A site with no untagged task can do this: an unrelated slow schedule
    // then cannot shut a daily one out of its only matching minute.
    const db = await createTestDb();
    const options = {
      db,
      lease: true,
      ttlMs: 60_000,
      leaseScope: "schedule",
    } as const;
    const busy = createScheduledRunGuard({ ...options, holder: "busy" });
    const daily = createScheduledRunGuard({ ...options, holder: "daily" });

    let release: () => void = () => undefined;
    const working = new Promise<void>((resolve) => (release = resolve));
    const slow = busy.run("*/5 * * * *", MINUTE, () => working);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(daily.run("0 3 * * *", MINUTE, noWork)).resolves.toBe("ran");
    release();
    await expect(slow).resolves.toBe("ran");
  });

  test("mints a fresh token per run, so a finished run cannot free a live lease", async () => {
    const db = await createTestDb();
    const one = createScheduledRunGuard({
      db,
      holder: "same-host:1",
      lease: true,
      ttlMs: 60_000,
    });
    const two = createScheduledRunGuard({
      db,
      holder: "same-host:1",
      lease: true,
      ttlMs: 60_000,
    });

    // Identical holder strings — two containers named alike, app as pid 1.
    await one.run("*/5 * * * *", MINUTE, noWork);
    let release: () => void = () => undefined;
    const working = new Promise<void>((resolve) => (release = resolve));
    const held = two.run("*/5 * * * *", MINUTE + 1, () => working);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(one.run("*/5 * * * *", MINUTE + 2, noWork)).resolves.toBe(
      "leased",
    );
    release();
    await expect(held).resolves.toBe("ran");
  });
});
