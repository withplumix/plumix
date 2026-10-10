import type { AppContext } from "../context/app-context.js";
import type { ScheduledRunReport } from "../context/runtime-adapter.js";
import type { PlumixApp } from "./app.js";
import { flushPurgeTags } from "../cdn/purge.js";
import { logErrorSafely } from "../context/log.js";
import { scheduledTasksFor } from "./contract/schedules.js";
import { deliverTelemetrySnapshot } from "./telemetry-delivery.js";

/**
 * Never returns the `aborted` arm. Omitting `firedCron` runs every task. Must
 * not run inside a dispatched request: it delivers the telemetry snapshot
 * itself.
 */
export async function runScheduledTasks(
  app: Pick<PlumixApp, "scheduledTasks">,
  ctx: AppContext,
  firedCron?: string,
): Promise<ScheduledRunReport> {
  const startedAt = Date.now();
  const failed: string[] = [];
  let ran = 0;
  for (const task of scheduledTasksFor(app, firedCron)) {
    try {
      // One span per task run, so cron work traces through the same collector
      // as request work — a failing task is an error span, not just a log line.
      await ctx.telemetry.span(`cron: ${task.id}`, (s) => {
        s.set("cron.plugin", task.registeredBy);
        if (task.cron !== undefined) s.set("cron.schedule", task.cron);
        return task.handler(ctx);
      });
      ran++;
    } catch (error) {
      const label = `${task.registeredBy}:${task.id}`;
      failed.push(label);
      logErrorSafely(
        ctx.logger,
        `[plumix] scheduled task "${label}" failed`,
        error,
        { taskId: task.id, plugin: task.registeredBy, cron: task.cron },
      );
    }
  }
  try {
    // A scheduled publish fires `entry:published`; flush the batched CDN
    // purge it accumulated, the same request-end seam the dispatcher uses.
    flushPurgeTags(ctx);
    // No response exists on this path — the envelope carries a synthetic 200;
    // task failures are error spans, caught above so siblings still run.
    deliverTelemetrySnapshot(ctx, 200, startedAt);
  } catch (error) {
    // A CDN adapter that throws synchronously must not discard the accounting
    // the loop just did: the tasks ran, and the caller is about to be told
    // whether they worked.
    logErrorSafely(ctx.logger, "[plumix] scheduled run epilogue failed", error);
  }
  return { ran, failed };
}
