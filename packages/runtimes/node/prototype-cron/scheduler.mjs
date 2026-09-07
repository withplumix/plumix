// PROTOTYPE — throwaway. VARIANT A: an in-process tick loop.
//
// Derives the distinct schedules from the built app's tasks, sleeps to each
// UTC minute boundary, and fires `handler.scheduled` once per due schedule.
import { parseCron } from "./cron-match.mjs";

const MINUTE = 60_000;

/**
 * @param tasks       app.scheduledTasks
 * @param fire        (cron, scheduledTime) => Promise<void>  — handler.scheduled
 * @param clock       { now, sleep }
 * @param lock        { run(key, fn): Promise<"ran"|"held"> }  — pluggable; see lease.mjs
 * @param onMissed    "skip" | "catch-up"
 */
export function createScheduler({ tasks, fire, clock, lock, log, onMissed = "skip" }) {
  // Boot-time: an unparseable cron throws HERE, loudly, instead of silently
  // never firing — the Cloudflare byte-match trap, avoided.
  const schedules = [];
  const seen = new Set();
  for (const task of tasks) {
    if (task.cron === undefined) continue;
    if (seen.has(task.cron)) continue;
    seen.add(task.cron);
    try {
      schedules.push(parseCron(task.cron));
    } catch (error) {
      throw new Error(
        `scheduled task "${task.registeredBy}:${task.id}" declares cron "${task.cron}" which this runtime cannot fire: ${error.message}`,
      );
    }
  }
  // A task with no cron runs on every firing (core's contract). If EVERY task
  // is untagged there is still work to fire, so the loop needs a heartbeat.
  const hasUntagged = tasks.some((t) => t.cron === undefined);
  if (hasUntagged && schedules.length === 0) schedules.push(parseCron("* * * * *"));

  let stopped = false;
  let inFlight = null;

  async function tick(minuteStart) {
    const due = schedules.filter((s) => s.matches(new Date(minuteStart)));
    if (due.length === 0) return;
    // Firings are serialised: a run never overlaps another run, whatever the
    // task-to-schedule mapping is, so an untagged task cannot double-run.
    for (const schedule of due) {
      if (stopped) break;
      const outcome = await lock.run("scheduled", () => fire(schedule.expression, minuteStart));
      if (outcome === "held") {
        log(`skipped ${schedule.expression} at ${new Date(minuteStart).toISOString()} — another run holds the lock`);
      }
    }
  }

  return {
    async start() {
      let lastMinute = Math.floor(clock.now() / MINUTE) * MINUTE;
      while (!stopped) {
        const nextMinute = lastMinute + MINUTE;
        await clock.sleep(Math.max(0, nextMinute - clock.now()));
        if (stopped) break;
        const wall = Math.floor(clock.now() / MINUTE) * MINUTE;
        if (wall > nextMinute && onMissed === "catch-up") {
          for (let m = nextMinute; m < wall; m += MINUTE) {
            inFlight = tick(m);
            await inFlight;
          }
        } else if (wall > nextMinute) {
          log(`missed ${String((wall - nextMinute) / MINUTE)} minute(s) up to ${new Date(wall).toISOString()} — not replayed`);
        }
        inFlight = tick(wall);
        await inFlight;
        inFlight = null;
        lastMinute = wall;
      }
    },
    /** SIGTERM: stop scheduling, let the run in flight finish. */
    async stop() {
      stopped = true;
      await inFlight;
    },
  };
}

/** The zero-cost lock: one process, one loop. */
export function inProcessLock() {
  let busy = false;
  return {
    async run(_key, fn) {
      if (busy) return "held";
      busy = true;
      try {
        await fn();
        return "ran";
      } finally {
        busy = false;
      }
    },
  };
}
