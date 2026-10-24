import type { AppContext } from "../context/app-context.js";
import type { ScheduledRunReport } from "../context/runtime-adapter.js";
import type { PlumixApp } from "./app.js";
import { flushPurgeTags } from "../cdn/purge.js";
import { withSignal } from "../context/app.js";
import { logErrorSafely } from "../context/log.js";
import { requestStore } from "../context/stores.js";
import {
  formatTimeout,
  scheduledTasksFor,
  scheduledTaskTimeoutMs,
} from "./contract/schedules.js";
import { deliverTelemetrySnapshot } from "./telemetry-delivery.js";

const COMPLETED = Symbol("completed");
const TIMED_OUT = Symbol("timed out");
const SHUT_DOWN = Symbol("shut down");

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
  const timedOut: string[] = [];
  let ran = 0;
  for (const task of scheduledTasksFor(app, firedCron)) {
    const label = `${task.registeredBy}:${task.id}`;
    const timeoutMs = scheduledTaskTimeoutMs(task);
    const timedOutAfter = `timed out after ${formatTimeout(timeoutMs)}`;
    const controller = new AbortController();
    const taskCtx = withSignal(
      ctx,
      AbortSignal.any([ctx.signal, controller.signal]),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The scheduler's signal outlives the firing; a listener per task would
    // pile up on it.
    const unlisten = new AbortController();
    // Listens on `ctx.signal` itself, whose listeners run before the combined
    // signal's: a task that rejects with the shutdown's reason still loses.
    const shutDown = new Promise<typeof SHUT_DOWN>((resolve) => {
      if (ctx.signal.aborted) resolve(SHUT_DOWN);
      ctx.signal.addEventListener("abort", () => resolve(SHUT_DOWN), {
        once: true,
        signal: unlisten.signal,
      });
    });
    // Never rejects: losing the race leaves a task that ignores its signal
    // running in the background, which core cannot stop and does not wait on.
    const budget = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        // Settled before the abort, so a task that rejects with the signal's
        // reason as it fires still loses the race and counts as timed out.
        resolve(TIMED_OUT);
        // Assigned, not passed: the options-bag constructor that takes a
        // `cause` is missing from the DOM types core compiles against.
        controller.abort(
          Object.assign(new DOMException(timedOutAfter, "TimeoutError"), {
            cause: "timeout",
          }),
        );
      }, timeoutMs);
    });
    try {
      // One span per task run, so cron work traces through the same collector
      // as request work — a failing task is an error span, not just a log line.
      const outcome = await ctx.telemetry.span(
        `cron: ${task.id}`,
        async (s) => {
          s.set("cron.plugin", task.registeredBy);
          if (task.cron !== undefined) s.set("cron.schedule", task.cron);
          const settled = await Promise.race([
            requestStore
              .run(taskCtx, () => Promise.resolve(task.handler(taskCtx)))
              .then(() => COMPLETED),
            budget,
            shutDown,
          ]);
          if (settled === TIMED_OUT) s.cancel(timedOutAfter);
          if (settled === SHUT_DOWN) s.cancel("shut down");
          return settled;
        },
      );
      if (outcome === TIMED_OUT || outcome === SHUT_DOWN) {
        timedOut.push(label);
        const meta = {
          taskId: task.id,
          plugin: task.registeredBy,
          cron: task.cron,
        };
        try {
          if (outcome === TIMED_OUT) {
            ctx.logger.warn(
              `[plumix] scheduled task "${label}" ${timedOutAfter}`,
              { ...meta, timeoutMs },
            );
          } else {
            ctx.logger.warn(
              `[plumix] scheduled task "${label}" shut down`,
              meta,
            );
          }
        } catch {
          // A logger that throws must not also count the task as failed.
        }
      } else {
        ran++;
      }
    } catch (error) {
      failed.push(label);
      logErrorSafely(
        ctx.logger,
        `[plumix] scheduled task "${label}" failed`,
        error,
        { taskId: task.id, plugin: task.registeredBy, cron: task.cron },
      );
    } finally {
      clearTimeout(timer);
      unlisten.abort();
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
  return { ran, failed, timedOut };
}
