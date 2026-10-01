import type { Db } from "../context/app-context.js";
import type { ScheduledRunReport } from "../context/runtime-adapter.js";
import type { PlumixEnv } from "./contract/bindings.js";
import type { ConnectedScheduledDb } from "./scheduled-guard.js";
import type {
  Scheduler,
  SchedulerClock,
  SchedulerLogger,
  SchedulerOptions,
} from "./scheduler.js";
import {
  connectScheduledDb,
  createScheduledRunGuard,
  scheduledLeaseScope,
} from "./scheduled-guard.js";
import { createScheduler } from "./scheduler.js";

export interface ScheduledRunnerOptions {
  readonly app: SchedulerOptions["app"] &
    Parameters<typeof connectScheduledDb>[0];
  readonly env: PlumixEnv;
  /**
   * Fires one schedule. Narrowing away the report would silence every failed
   * run: it is what the scheduler's failure logging reads (#2303).
   */
  readonly fire: (
    cron: string,
    scheduledTime: number,
  ) => Promise<void | ScheduledRunReport>;
  /**
   * Names this process in the lease row, for reading it back — a runtime
   * passes what identifies it on its host, such as `hostname:pid`.
   */
  readonly holder: string;
  /** Whether to take the cross-process lease; see `createScheduledRunGuard`. */
  readonly lease?: boolean;
  readonly ttlMs?: number;
  readonly logger?: SchedulerLogger;
  readonly clock?: SchedulerClock;
  /** Test seam: the database the guard writes to, instead of connecting one. */
  readonly db?: Db;
}

/**
 * Build and start the scheduler for a self-hosted deploy, with its run guard
 * wired to the site's own database.
 *
 * The guard belongs in the database rather than in this process because the
 * database is the only thing two replicas share — and sharing one is a
 * supported configuration today, since `plumix/db/libsql` points a self-hosted deploy
 * at Turso. A lock held in memory, or in a file beside the process, would be
 * silently wrong there.
 */
export function startScheduledRunner({
  app,
  env,
  fire,
  holder,
  lease = true,
  ttlMs,
  logger,
  clock,
  db,
}: ScheduledRunnerOptions): Scheduler {
  // A database handed in belongs to the caller.
  const connection: ConnectedScheduledDb =
    db === undefined ? connectScheduledDb(app, env) : { db };
  // Cleared on first use: a second `stop` must not close it again, and
  // node:sqlite throws when it does.
  let release = connection.close;
  const guard = createScheduledRunGuard({
    db: connection.db,
    holder,
    lease,
    leaseScope: scheduledLeaseScope(app),
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
