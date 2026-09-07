import { and, eq, lte, sql } from "drizzle-orm";

import type { Db } from "../context/app.js";
import type { PlumixApp } from "./app.js";
import type { PlumixEnv } from "./bindings.js";
import {
  scheduledTaskClaims,
  scheduledTaskLeases,
} from "../db/schema/scheduled_runs.js";

/**
 * The lease key when every schedule must serialise against every other. That is
 * the safe default because a task that declares no cron runs on *every* firing,
 * so two schedules running at once would run that one task twice at once.
 */
const SHARED_LEASE_KEY = "scheduled";

/** Five minutes: ~10x the worst plausible synchronous purge, and one publish cycle. */
const DEFAULT_LEASE_TTL_MS = 300_000;

export type ScheduledRunOutcome =
  /** This guard won the minute and the work ran. */
  | "ran"
  /** Another replica had already taken this schedule's minute. */
  | "claimed"
  /** Another run holds the lease; this firing is skipped rather than queued. */
  | "leased";

export interface ScheduledRunGuardOptions {
  readonly db: Db;
  /** Names the replica in the lease row, for reading it back; the run's own
   * identity is a UUID, so this need not be unique. */
  readonly holder: string;
  /**
   * Whether to take the lease as well as the claim. Off for a single-process
   * deploy — `plumix dev` above all, where a minutes-long expiry would outlive
   * a process that restarts every few seconds and leave cron looking dead.
   */
  readonly lease: boolean;
  readonly ttlMs?: number;
  /**
   * `"shared"` (the default) makes every schedule contend for one lease.
   * `"schedule"` gives each its own, which a site with no untagged task may do
   * safely and which stops a slow schedule from shutting out an unrelated one —
   * a daily task blocked at its only matching minute waits a whole day.
   */
  readonly leaseScope?: "shared" | "schedule";
}

export interface ScheduledRunGuard {
  /**
   * Run `work` for `schedule` at `minute`, unless another run already has it.
   * Rejects with whatever `work` threw, having released the lease first.
   */
  run(
    schedule: string,
    minute: number,
    work: () => void | Promise<void>,
  ): Promise<ScheduledRunOutcome>;
}

/**
 * The guard that makes "two firings never run the same task concurrently" true
 * across replicas as well as within one process.
 *
 * Two rows, because they answer different questions. The claim gives at most
 * one run per schedule per minute and survives a holder being killed, since it
 * has no expiry to strand. The lease gives no overlap in time, which the claim
 * cannot: minute N+1 is a different claim, so without a lease a run that
 * outlives its own schedule is overlapped by the next firing.
 *
 * Both writes end in `RETURNING`, whose row count is the same on libsql, D1 and
 * `node:sqlite` — the drivers disagree about where an update count lives, but
 * they all agree about returned rows.
 */
export function createScheduledRunGuard({
  db,
  holder,
  lease,
  ttlMs = DEFAULT_LEASE_TTL_MS,
  leaseScope = "shared",
}: ScheduledRunGuardOptions): ScheduledRunGuard {
  const claim = async (schedule: string, minute: number): Promise<boolean> => {
    const rows = await db
      .insert(scheduledTaskClaims)
      .values({ schedule, lastMinute: minute })
      .onConflictDoUpdate({
        target: scheduledTaskClaims.schedule,
        set: { lastMinute: minute },
        // Strictly greater, so a replica whose clock lags cannot replay a
        // minute another replica has already run.
        setWhere: sql`${scheduledTaskClaims.lastMinute} < ${minute}`,
      })
      .returning({ schedule: scheduledTaskClaims.schedule });
    return rows.length > 0;
  };

  return {
    async run(schedule, minute, work) {
      if (!lease) {
        if (!(await claim(schedule, minute))) return "claimed";
        await work();
        return "ran";
      }

      const leaseKey =
        leaseScope === "shared" ? SHARED_LEASE_KEY : `scheduled:${schedule}`;
      // A run identity, not a process one: hostname and pid repeat across
      // containers and restarts, and a stale token equal to a live one would
      // let a finished run delete the lease a running one holds. The holder
      // rides along so the row says which replica is working.
      const token = `${holder}:${crypto.randomUUID()}`;
      const now = Date.now();
      const held = await db
        .insert(scheduledTaskLeases)
        .values({ key: leaseKey, token, expiresAt: now + ttlMs })
        .onConflictDoUpdate({
          target: scheduledTaskLeases.key,
          set: { token, expiresAt: now + ttlMs },
          // Only a lapsed lease may be taken. A live one belongs to a run that
          // is still working, whatever this replica thinks the minute is.
          setWhere: lte(scheduledTaskLeases.expiresAt, now),
        })
        .returning({ key: scheduledTaskLeases.key });
      // Before the claim, deliberately. Claiming first would burn the minute on
      // a firing that then loses the lease and never runs — and a schedule that
      // matches once a day would lose the whole day.
      if (held.length === 0) return "leased";

      // Renews the lease while the run works, so a run that legitimately
      // outlives the TTL is not overtaken. It is a refinement, not the
      // guarantee: a task that blocks the event loop — `node:sqlite` is
      // synchronous, so a large delete does — blocks this timer too, which is
      // why the TTL itself is sized above any plausible run.
      const heartbeat = setInterval(
        () => {
          // A drizzle builder runs only once something subscribes, so the
          // handlers are what execute it — and they swallow a failed renewal,
          // which the TTL already bounds.
          void db
            .update(scheduledTaskLeases)
            .set({ expiresAt: Date.now() + ttlMs })
            .where(
              and(
                eq(scheduledTaskLeases.key, leaseKey),
                eq(scheduledTaskLeases.token, token),
              ),
            )
            .then(
              () => undefined,
              () => undefined,
            );
        },
        Math.max(1, Math.floor(ttlMs / 3)),
      );
      // A pending renewal must not be what keeps a process alive. `unref` is
      // Node's timer handle; a runtime whose `setInterval` returns a number
      // has no event loop for it to hold open.
      (heartbeat as { unref?: () => void }).unref?.();

      try {
        if (!(await claim(schedule, minute))) return "claimed";
        await work();
        return "ran";
      } finally {
        clearInterval(heartbeat);
        // Scoped to the token: a lease this run already lost to a successor
        // must not be deleted out from under them. Failures are swallowed so
        // the release cannot replace the task's own error, or its result, with
        // a database one — the TTL frees the row regardless.
        await db
          .delete(scheduledTaskLeases)
          .where(
            and(
              eq(scheduledTaskLeases.key, leaseKey),
              eq(scheduledTaskLeases.token, token),
            ),
          )
          .then(
            () => undefined,
            () => undefined,
          );
      }
    },
  };
}

export interface ConnectedScheduledDb {
  readonly db: Db;
  /** Release it — the adapter's own `close`, absent when it has none. */
  readonly close?: () => void;
}

/**
 * Connect the database a scheduled run writes through, outside any request.
 *
 * A scheduled run always writes, so a deploy that routes writes to a primary
 * does so for the guard's own rows too. The request is a marker rather than an
 * inbound one — the same URL core's scheduled handler builds, so an adapter
 * that routes on it sees one shape however the run was triggered.
 */
export function connectScheduledDb(
  app: PlumixApp,
  env: PlumixEnv,
): ConnectedScheduledDb {
  const request = new Request("http://localhost/_plumix/internal/scheduled", {
    method: "POST",
  });
  const { db, close } = app.config.database.connect(env, request, app.schema);
  return { db: db as Db, close };
}
