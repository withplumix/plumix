import type { ScheduledRunReport } from "plumix";

import { ScheduledRunError } from "./errors.js";

/**
 * What this needs of the Workers `ScheduledController` — the object the entry
 * receives as `scheduled`'s first argument.
 *
 * Named structurally rather than taken as `ScheduledController` so the public
 * declaration does not depend on `@cloudflare/workers-types` being configured
 * in the consumer that reads it.
 */
export interface ScheduledFiring {
  /** The schedule Cloudflare fired, as written in `triggers.crons`. */
  readonly cron: string;
  /** Declines the platform's replay of this firing. */
  readonly noRetry: () => void;
}

/**
 * Mark the Worker invocation failed when the firing did not do its job.
 *
 * Core reports rather than throws, for the reasons {@link ScheduledRunReport}
 * gives, which leaves the invocation's own outcome — the Cron Trigger Past
 * Events table, Workers analytics, and anything alerting on them — saying a
 * firing where everything failed went fine. Throwing here corrects that.
 *
 * Any failed task fails the firing, not only a firing where all of them failed:
 * `plumix cron run` already exits non-zero over one, and two runtimes
 * disagreeing about what a failed firing is costs more than either rule.
 *
 * Whether Cloudflare may replay the firing turns on `ran`. Workers replays the
 * whole handler, not the tasks that failed, and nothing here deduplicates that:
 * the run guard is a Node and CLI concern. So a firing that got no work done
 * keeps its retry, which is the transient case a retry is for. An aborted run
 * reports `ran: 0` by construction, so the check below reaches `noRetry` only
 * for a run whose tasks did work and then failed.
 *
 * Deferred work is unaffected either way: the purges and telemetry core hands
 * to `waitUntil` still settle after an uncaught throw here — verified against
 * workerd, whose cron invocation records the error and delivers them both.
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
