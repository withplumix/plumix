import type { ScheduledRunReport } from "../context/runtime-adapter.js";
import type { PlumixApp } from "./app.js";
import type { CronSchedule } from "./contract/cron.js";
import type { ScheduledRunGuard } from "./scheduled-guard.js";
import { parseCron } from "./contract/cron.js";
import { declaredSchedules } from "./contract/schedules.js";

const MINUTE_MS = 60_000;

// So tasks that declared no cron still have a firing.
const EVERY_MINUTE = "* * * * *";

export interface SchedulerClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface SchedulerLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface SchedulerOptions {
  readonly app: Pick<PlumixApp, "scheduledTasks">;
  /**
   * Fires one schedule — the entry hands this `handler.scheduled`, whose report
   * says which tasks failed. A caught task failure is otherwise invisible here.
   */
  readonly fire: (
    cron: string,
    scheduledTime: number,
  ) => Promise<void | ScheduledRunReport>;
  readonly clock?: SchedulerClock;
  readonly logger?: SchedulerLogger;
  /**
   * Only the database guard can prevent overlap with replicas this process
   * cannot see.
   */
  readonly guard?: ScheduledRunGuard;
}

export interface Scheduler {
  /** Resolves when the loop stops; call without awaiting. */
  start(): Promise<void>;
  /**
   * Stops scheduling and waits for the firing in flight, for at most
   * `timeoutMs`. Unbounded when omitted. Resolves false when the budget ran out
   * with a firing still running.
   */
  stop(options?: { timeoutMs?: number }): Promise<boolean>;
}

const systemClock: SchedulerClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      // A pending tick must not keep the process alive.
      (timer as { unref?: () => void }).unref?.();
    }),
};

/**
 * Firings are serialised: a run longer than its schedule costs reported skipped
 * minutes, not a concurrent run.
 */
export function createScheduler({
  app,
  fire,
  clock = systemClock,
  logger = console,
  guard,
}: SchedulerOptions): Scheduler {
  const schedules = deriveSchedules(app);

  let stopped = false;
  // A call, because TypeScript keeps `stopped` narrowed to false across awaits.
  const isStopped = (): boolean => stopped;
  let inFlight: Promise<void> | undefined;

  async function fireDue(minuteStart: number): Promise<void> {
    const at = new Date(minuteStart);
    for (const schedule of schedules) {
      if (isStopped()) return;
      if (!schedule.matches(at)) continue;
      try {
        const run = async (): Promise<void> => {
          const report = await fire(schedule.expression, minuteStart);
          // Each failure is already logged with its error by core; this is the
          // line that says the firing as a whole did not do its job.
          if (report && (report.failed.length > 0 || report.aborted)) {
            logger.error(
              report.aborted === undefined
                ? `[plumix] cron "${schedule.expression}": ${String(report.failed.length)} task(s) failed: ${report.failed.join(", ")}`
                : `[plumix] cron "${schedule.expression}" never started: ${report.aborted}`,
            );
          }
        };
        if (!guard) {
          await run();
          continue;
        }
        // The minute, not the timestamp: it is what two replicas can agree on
        // without agreeing on when they woke up.
        const outcome = await guard.run(
          schedule.expression,
          minuteStart / MINUTE_MS,
          run,
        );
        if (outcome !== "ran") {
          logger.info(
            `[plumix] cron skipped "${schedule.expression}" at ${at.toISOString()}: ${
              outcome === "claimed"
                ? "another replica already ran this minute"
                : "another run holds the lease"
            }`,
          );
        }
      } catch (error) {
        // One bad firing must not end the loop for every other schedule.
        logger.error(
          `[plumix] scheduled run for "${schedule.expression}" failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return {
    async start() {
      if (schedules.length === 0) return;
      let last = floorToMinute(clock.now());
      while (!isStopped()) {
        await clock.sleep(Math.max(0, last + MINUTE_MS - clock.now()));
        if (isStopped()) return;

        const wall = floorToMinute(clock.now());
        // A timer may fire a hair early; without this the same minute would be
        // fired twice and the loop would spin until the boundary arrived.
        if (wall <= last) continue;
        const missed = (wall - last) / MINUTE_MS - 1;
        if (missed > 0) {
          // Not replayed, or a suspended laptop wakes to a stampede. In the try
          // because `start()` is voided, so a throw would go unwatched.
          try {
            logger.warn(
              `[plumix] cron missed ${String(missed)} minute(s) before ${new Date(wall).toISOString()}; not replaying them`,
            );
          } catch {
            // A logger that throws is not a reason to stop firing.
          }
        }

        inFlight = fireDue(wall);
        await inFlight;
        inFlight = undefined;
        last = wall;
      }
    },

    async stop(options) {
      stopped = true;
      const timeoutMs = options?.timeoutMs;
      if (inFlight === undefined || timeoutMs === undefined) {
        await inFlight;
        return true;
      }
      // A run is only ever as long as its task; a shutdown gets one budget, and
      // the drain behind this one still needs what is left of it.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          inFlight.then(() => true),
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// `buildApp` already parsed every expression, so a throw here is a bug, not a
// config error.
function deriveSchedules(
  app: Pick<PlumixApp, "scheduledTasks">,
): readonly CronSchedule[] {
  const declared = declaredSchedules(app);
  const needsHeartbeat = declared.length === 0 && app.scheduledTasks.length > 0;
  return (needsHeartbeat ? [EVERY_MINUTE] : declared).map(parseCron);
}

function floorToMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}
