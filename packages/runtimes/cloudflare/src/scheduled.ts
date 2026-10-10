import type { ScheduledRunReport } from "plumix";

import { ScheduledRunError } from "./errors.js";

/**
 * Structural rather than `ScheduledController`, so the declaration doesn't need
 * `@cloudflare/workers-types`.
 */
export interface ScheduledFiring {
  /** The schedule Cloudflare fired, as written in `triggers.crons`. */
  readonly cron: string;
  /** Declines the platform's replay of this firing. */
  readonly noRetry: () => void;
}

/**
 * Any failed task fails the firing, matching `plumix cron run`. Only a firing
 * that did no work keeps Cloudflare's retry, since Workers replays the whole
 * handler.
 */
export function surfaceScheduledFailure(
  report: ScheduledRunReport | void,
  firing: ScheduledFiring,
): void {
  if (report === undefined) return;
  if (report.aborted === undefined && report.failed.length === 0) return;
  if (report.ran > 0) firing.noRetry();
  if (report.aborted !== undefined) {
    throw ScheduledRunError.neverStarted({
      cron: firing.cron,
      reason: report.aborted,
    });
  }
  throw ScheduledRunError.tasksFailed({
    cron: firing.cron,
    failed: report.failed,
  });
}
