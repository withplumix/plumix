import { hostname } from "node:os";
import type { Db, PlumixApp, PlumixEnv } from "plumix";
import { connectScheduledDb, createScheduledRunGuard } from "plumix";

import type {
  Scheduler,
  SchedulerClock,
  SchedulerLogger,
} from "./scheduler.js";
import { createScheduler } from "./scheduler.js";

export interface ScheduledRunnerOptions {
  readonly app: PlumixApp;
  readonly env: PlumixEnv;
  readonly fire: (cron: string, scheduledTime: number) => Promise<void>;
  /** Whether to take the cross-process lease; see `createScheduledRunGuard`. */
  readonly lease?: boolean;
  readonly ttlMs?: number;
  readonly logger?: SchedulerLogger;
  readonly clock?: SchedulerClock;
  /** Test seam: the database the guard writes to, instead of connecting one. */
  readonly db?: Db;
}

/**
 * Build and start the scheduler for a Node deploy, with its run guard wired to
 * the site's own database.
 *
 * The guard belongs in the database rather than in this process because the
 * database is the only thing two replicas share — and sharing one is a
 * supported configuration today, since `plumix/db/libsql` points a Node deploy
 * at Turso. A lock held in memory, or in a file beside the process, would be
 * silently wrong there.
 */
export function startScheduledRunner({
  app,
  env,
  fire,
  lease = true,
  ttlMs,
  logger,
  clock,
  db,
}: ScheduledRunnerOptions): Scheduler {
  // A task that declared no cron runs on every firing, so its schedules have to
  // serialise against each other; without one, each schedule can hold its own
  // lease and a slow schedule cannot shut an unrelated one out of its minute.
  const runsOnEveryFiring = app.scheduledTasks.some(
    (task) => task.cron === undefined,
  );
  const guard = createScheduledRunGuard({
    // The scheduler's connection is long-lived on purpose: the next firing
    // queries through it, so it is never released here.
    db: db ?? connectScheduledDb(app, env).db,
    holder: `${hostname()}:${String(process.pid)}`,
    lease,
    leaseScope: runsOnEveryFiring ? "shared" : "schedule",
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });

  const scheduler = createScheduler({
    app,
    fire,
    guard,
    ...(clock ? { clock } : {}),
    ...(logger ? { logger } : {}),
  });
  void scheduler.start();
  return scheduler;
}
