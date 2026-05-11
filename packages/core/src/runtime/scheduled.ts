import type { AppContext } from "../context/app.js";
import type { PlumixApp } from "./app.js";

/**
 * Run every plugin-registered scheduled task against the given
 * `AppContext`. Each task is wrapped in its own `try/catch` so a
 * single failure can't abort siblings — failures are surfaced
 * through `ctx.logger.error` with `{ taskId, cron }` metadata.
 *
 * Runtime adapters call this from their `buildScheduledHandler` after
 * constructing a scheduled-flavor `AppContext`.
 */
export async function runScheduledTasks(
  app: PlumixApp,
  ctx: AppContext,
): Promise<void> {
  for (const task of app.scheduledTasks) {
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
}
