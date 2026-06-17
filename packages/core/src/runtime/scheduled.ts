import type { AppContext } from "../context/app.js";
import type { PlumixApp } from "./app.js";
import { flushPurgeTags } from "../cache/purge.js";

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
 * constructing a scheduled-flavor `AppContext`.
 */
export async function runScheduledTasks(
  app: PlumixApp,
  ctx: AppContext,
  firedCron?: string,
): Promise<void> {
  for (const task of app.scheduledTasks) {
    if (
      firedCron !== undefined &&
      task.cron !== undefined &&
      task.cron !== firedCron
    ) {
      continue;
    }
    try {
      await task.handler(ctx);
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
}
