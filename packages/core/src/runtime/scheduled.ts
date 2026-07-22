import type { AppContext } from "../context/app.js";
import type { PlumixApp } from "./app.js";
import { flushPurgeTags } from "../cache/purge.js";
import { deliverTelemetrySnapshot } from "./telemetry-delivery.js";

/**
 * Run the registered scheduled tasks against the given `AppContext`. Each task
 * is wrapped in its own `try/catch` so a single failure can't abort siblings —
 * failures are surfaced through `ctx.logger.error` with `{ taskId, cron }`.
 *
 * `firedCron` is the schedule that triggered this invocation (Cloudflare's
 * `event.cron`). A task with a declared `cron` runs only when it matches; a
 * task with no `cron` runs on every invocation. When `firedCron` is omitted
 * (tests, runtimes that don't surface it), every task runs.
 *
 * Runtime adapters call this from their `buildScheduledHandler` after
 * constructing a scheduled-flavor `AppContext`. Owns the run's telemetry
 * snapshot delivery, so it must not be invoked inside a dispatched request —
 * the dispatcher would deliver the same collector a second time.
 */
export async function runScheduledTasks(
  app: PlumixApp,
  ctx: AppContext,
  firedCron?: string,
): Promise<void> {
  const startedAt = Date.now();
  for (const task of app.scheduledTasks) {
    if (
      firedCron !== undefined &&
      task.cron !== undefined &&
      task.cron !== firedCron
    ) {
      continue;
    }
    try {
      // One span per task run, so cron work traces through the same collector
      // as request work — a failing task is an error span, not just a log line.
      await ctx.telemetry.span(`cron: ${task.id}`, (s) => {
        s.set("cron.plugin", task.registeredBy);
        if (task.cron !== undefined) s.set("cron.schedule", task.cron);
        return task.handler(ctx);
      });
    } catch (error) {
      ctx.logger.error(
        `[plumix] scheduled task "${task.registeredBy}:${task.id}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { error, taskId: task.id, plugin: task.registeredBy, cron: task.cron },
      );
    }
  }
  // A scheduled publish fires `entry:published`; flush the batched edge-cache
  // purge it accumulated, the same request-end seam the dispatcher uses.
  flushPurgeTags(ctx);
  // No response exists on this path — the envelope carries a synthetic 200;
  // task failures are error spans, caught above so siblings still run.
  deliverTelemetrySnapshot(ctx, 200, startedAt);
}
