import { hostname } from "node:os";
import type {
  ConnectedScheduledDb,
  Db,
  PlumixApp,
  PlumixEnv,
  ScheduledRunReport,
} from "plumix";
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
  /**
   * Fires one schedule. Narrowing away the report would silence every failed
   * run: it is what the scheduler's failure logging reads (#2303).
   */
  readonly fire: (
    cron: string,
    scheduledTime: number,
  ) => Promise<void | ScheduledRunReport>;
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
  // A database handed in belongs to the caller.
  const connection: ConnectedScheduledDb =
    db === undefined ? connectScheduledDb(app, env) : { db };
  // Cleared on first use: a second `stop` must not close it again, and
  // node:sqlite throws when it does.
  let release = connection.close;
  const guard = createScheduledRunGuard({
    db: connection.db,
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
  return {
    ...scheduler,
    async stop(options) {
      const settled = await scheduler.stop(options);
      // A firing `stop` gave up on still writes through the guard.
      if (settled) {
        try {
          release?.();
        } catch (error) {
          (logger ?? console).warn(
            `[plumix] database_close_failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        release = undefined;
      }
      return settled;
    },
  };
}
