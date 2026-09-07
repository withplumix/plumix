import type {
  CronSchedule,
  PlumixApp,
  ScheduledRunGuard,
  ScheduledRunReport,
} from "plumix";
import { declaredSchedules, parseCron } from "plumix";

const MINUTE_MS = 60_000;

/** The catch-all schedule, so tasks that declared no cron still have a firing. */
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
  readonly app: PlumixApp;
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
   * Decides whether this process may run a given firing. Serialising the loop
   * keeps a process from overlapping itself; only the guard, which lives in the
   * database, can speak for replicas this process cannot see.
   */
  readonly guard?: ScheduledRunGuard;
}

export interface Scheduler {
  /** Resolves when the loop stops; call without awaiting. */
  start(): Promise<void>;
  /**
   * Stops scheduling and waits for the firing in flight, for at most
   * `timeoutMs`. Unbounded when omitted.
   */
  stop(options?: { timeoutMs?: number }): Promise<void>;
}

const systemClock: SchedulerClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      // A pending tick must not be what keeps the process alive.
      timer.unref();
    }),
};

/**
 * Fires a site's scheduled tasks on a Node deploy.
 *
 * The schedules come from `app.scheduledTasks`, never from a list here: they
 * are contributed by plugins, so any list a runtime kept would go stale the
 * moment a site installed one — the trap a Cloudflare deploy already has, where
 * a task whose cron does not byte-match a declared trigger silently never runs.
 *
 * Firings are serialised and awaited, so this loop cannot overlap itself; a run
 * longer than its own schedule costs skipped minutes, which are reported, not a
 * second concurrent run. Overlap *between processes* is not this loop's to
 * solve — that is the run guard's, in the database, so it holds for replicas
 * this process cannot see.
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
  // Read through a call, not the binding: TypeScript narrows `stopped` to
  // false inside `while (!stopped)` and does not widen it across an await, so
  // the re-checks below would read as always-false and trip
  // no-unnecessary-condition.
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
          // Not replayed on purpose. A suspended laptop or a long run would
          // otherwise wake to a stampede of catch-up firings, all of them
          // doing work whose moment has passed.
          //
          // Inside the try because `start()` is voided by its callers: a
          // throwing logger here would end the loop through an unhandled
          // rejection nothing is watching.
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
        return;
      }
      // A run is only ever as long as its task; a shutdown gets one budget, and
      // the drain behind this one still needs what is left of it.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          inFlight,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The distinct schedules a firing loop has to cover. A task that declared no
 * cron runs on every firing, so a site whose only tasks are untagged still
 * needs a heartbeat to carry them.
 *
 * Every expression here parsed at boot — `buildApp` rejects a site whose task
 * declares one this runtime cannot fire — so a throw at this point is a bug
 * rather than a config error.
 */
function deriveSchedules(app: PlumixApp): readonly CronSchedule[] {
  const declared = declaredSchedules(app);
  const needsHeartbeat = declared.length === 0 && app.scheduledTasks.length > 0;
  return (needsHeartbeat ? [EVERY_MINUTE] : declared).map(parseCron);
}

function floorToMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}
