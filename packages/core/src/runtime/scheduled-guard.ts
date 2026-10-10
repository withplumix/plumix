import { and, eq, lte, sql } from "drizzle-orm";

import type { Db } from "../context/app-context.js";
import type { PlumixApp } from "./app.js";
import type { PlumixEnv } from "./contract/bindings.js";
import {
  scheduledTaskClaims,
  scheduledTaskLeases,
} from "../db/schema/scheduled_runs.js";

// A task with no cron runs on every firing, so concurrent schedules would run
// it twice at once.
const SHARED_LEASE_KEY = "scheduled";

// ~10x the worst plausible synchronous purge, and one publish cycle.
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
   * Off for single-process deploys: under `plumix dev`, a minutes-long lease
   * outlives restarts and leaves cron looking dead.
   */
  readonly lease: boolean;
  readonly ttlMs?: number;
  /**
   * `"schedule"` is safe only without untagged tasks, and stops a slow schedule
   * shutting out a daily one for a whole day.
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
 * The claim allows one run per schedule-minute; the lease prevents a long run
 * overlapping the next minute. Writes use `RETURNING`, since drivers disagree
 * on update counts.
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
      // Per run, not per process: hostname and pid repeat across containers,
      // letting a finished run delete a live lease.
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
      // Before the claim, or a firing that loses the lease burns the minute,
      // and a daily schedule its day.
      if (held.length === 0) return "leased";

      // A refinement, not the guarantee: a synchronous `node:sqlite` delete
      // blocks this timer too, so the TTL exceeds any plausible run.
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
      // A pending renewal must not keep the process alive.
      (heartbeat as { unref?: () => void }).unref?.();

      try {
        if (!(await claim(schedule, minute))) return "claimed";
        await work();
        return "ran";
      } finally {
        clearInterval(heartbeat);
        // Token-scoped so a successor's lease survives. Failures are swallowed
        // so they can't mask the task's outcome; the TTL frees the row.
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

/** `"shared"` when any task declares no cron, since it runs on every firing. */
export function scheduledLeaseScope(
  app: Pick<PlumixApp, "scheduledTasks">,
): "shared" | "schedule" {
  return app.scheduledTasks.some((task) => task.cron === undefined)
    ? "shared"
    : "schedule";
}

export interface ConnectedScheduledDb {
  readonly db: Db;
  /** Release it — the adapter's own `close`, absent when it has none. */
  readonly close?: () => void;
}

/**
 * The request is a marker matching core's scheduled handler URL, so an adapter
 * routing on it sees one shape.
 */
export function connectScheduledDb(
  app: Pick<PlumixApp, "schema"> & {
    readonly config: Pick<PlumixApp["config"], "database">;
  },
  env: PlumixEnv,
): ConnectedScheduledDb {
  const request = new Request("http://localhost/_plumix/internal/scheduled", {
    method: "POST",
  });
  const { db, close } = app.config.database.connect(env, request, app.schema);
  return { db: db as Db, close };
}
