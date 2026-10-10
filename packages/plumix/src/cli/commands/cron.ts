import { hostname } from "node:os";

import type {
  CommandContext,
  CommandDefinition,
  PlumixApp,
  PlumixHandler,
  ScheduledRunGuard,
  ScheduledRunOutcome,
  ScheduledRunReport,
} from "@plumix/core";
import {
  declaredSchedules,
  parseCron,
  scheduledTasksFor,
} from "@plumix/core/cli";

import { PlumixCliError } from "../errors.js";
import { report } from "../report.js";

const MINUTE_MS = 60_000;

const EVERY_MINUTE = "* * * * *";

export const cronCommand: CommandDefinition<PlumixApp> = {
  describe: "List the site's scheduled tasks, or fire one schedule now",
  async run(ctx) {
    const sub = ctx.argv[0];
    if (sub === undefined || sub === "list") {
      listSchedules(ctx.app);
      return;
    }
    if (sub === "run") {
      await runSchedule(ctx);
      return;
    }
    throw PlumixCliError.unknownSubcommand({
      command: "cron",
      subcommand: sub,
      supported: ["list", "run"],
    });
  },
};

// Printed rather than hand-written: plugins contribute schedules, so a
// hand-written crontab goes stale silently when a site installs one.
function listSchedules(app: PlumixApp): void {
  if (app.scheduledTasks.length === 0) {
    report.info("This site declares no scheduled tasks.");
    return;
  }

  const schedules = declaredSchedules(app);
  if (schedules.length === 0) {
    // Every task runs on every firing; an operator told "none" would wire up
    // nothing.
    report.info(
      "No task declares a schedule of its own, so every one runs on each " +
        'firing. Fire them with `plumix cron run "* * * * *"`:\n',
    );
    for (const task of app.scheduledTasks) {
      report.info(`  ${task.registeredBy}:${task.id}`);
    }
    return;
  }

  report.info("Schedules this site declares:\n");
  for (const schedule of schedules) {
    report.info(`  ${schedule}`);
    for (const task of scheduledTasksFor(app, schedule)) {
      report.info(`      ${task.registeredBy}:${task.id}`);
    }
  }
  report.info(
    '\nFire one with `plumix cron run "<expression>"`. A task listed under ' +
      "more than one schedule declared no cron of its own, so it runs on every " +
      "firing.",
  );
}

async function runSchedule(ctx: CommandContext<PlumixApp>): Promise<void> {
  const expression = ctx.argv[1];
  if (expression === undefined || expression === "") {
    throw PlumixCliError.cronRunMissingExpression();
  }
  // Rejects before any work: a malformed expression here would otherwise match
  // nothing and exit green.
  try {
    parseCron(expression);
  } catch (cause) {
    throw PlumixCliError.cronRunInvalidExpression({
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }

  // Whitespace is not part of a schedule's identity, but `runScheduledTasks`
  // matches the declared string byte for byte — so fire the declared spelling,
  // not the one that was typed.
  const declared = declaredSchedules(ctx.app);
  const fired =
    declared.find((cron) => normalise(cron) === normalise(expression)) ??
    (declared.length === 0 && ctx.app.scheduledTasks.length > 0
      ? // Nothing declares a cron, so every task runs on every firing — and the
        // in-process scheduler claims this key for that case. Canonicalising
        // here is what stops a CronJob and a running server claiming two rows
        // for the same work and both firing it.
        EVERY_MINUTE
      : undefined);
  if (fired === undefined) {
    throw PlumixCliError.cronRunUnknownSchedule({ expression, declared });
  }

  // Dynamic so `dev`, which builds no app, does not load core's root barrel
  // (`cold-start.test.ts`).
  const {
    connectScheduledDb,
    createRuntimeHandler,
    createScheduledRunGuard,
    scheduledLeaseScope,
  } = await import("@plumix/core");
  const handler = createRuntimeHandler(ctx.app);

  // `nodeSqlite` resolves its path against the cwd; otherwise this opens an
  // empty database wherever the command was invoked.
  if (ctx.cwd !== process.cwd()) process.chdir(ctx.cwd);

  const { db, close } = connectScheduledDb(ctx.app, process.env);
  const guard = createScheduledRunGuard({
    db,
    // Names this invocation in the lease row; every pod of a CronJob would
    // otherwise write the same string.
    holder: `cli:${hostname()}:${String(process.pid)}`,
    lease: true,
    leaseScope: scheduledLeaseScope(ctx.app),
  });

  try {
    await fireSchedule(ctx, guard, fired, handler);
  } finally {
    // Drain first: deferred work still queries both connections until
    // `dispose()` returns. One release throwing must not strand the other or
    // replace the command's result.
    try {
      await handler.dispose?.();
    } catch (error) {
      report.detail(`Could not drain the handler: ${detailOf(error)}`);
    }
    try {
      close?.();
    } catch (error) {
      report.detail(`Could not release the database: ${detailOf(error)}`);
    }
  }
}

async function fireSchedule(
  ctx: CommandContext<PlumixApp>,
  guard: ScheduledRunGuard,
  fired: string,
  handler: PlumixHandler,
): Promise<void> {
  // One reading, so the minute claimed and the time the task is told cannot
  // straddle a boundary.
  const scheduledTime = Date.now();
  // `scheduled` may answer nothing — an adapter that does not report.
  let runReport: ScheduledRunReport | undefined;
  const outcome = await runGuarded(guard, fired, scheduledTime, async () => {
    runReport =
      (await handler.scheduled?.(
        { scheduledTime, cron: fired },
        { env: process.env },
      )) ?? undefined;
  });
  if (outcome !== "ran") {
    // Never a silent green exit: an operator has to be able to tell "nothing
    // to do" from "someone else is doing it".
    report.info(
      outcome === "leased"
        ? `Skipped "${fired}": another run holds the lease.`
        : `Skipped "${fired}": it already ran this minute.`,
    );
    return;
  }

  if (runReport?.aborted !== undefined) {
    throw PlumixCliError.cronRunNeverStarted({
      expression: fired,
      reason: runReport.aborted,
    });
  }
  // An adapter that reported nothing failed nothing.
  const failed = runReport?.failed ?? [];
  if (failed.length > 0) {
    throw PlumixCliError.cronRunTasksFailed({ expression: fired, failed });
  }

  const ran = scheduledTasksFor(ctx.app, fired)
    .map((task) => `${task.registeredBy}:${task.id}`)
    .join(", ");
  report.info(`Fired "${fired}": ${ran}`);
}

function normalise(expression: string): string {
  return expression.trim().split(/\s+/).join(" ");
}

// The guard touches the database first, so an install that skipped `plumix
// migrate` would otherwise meet a raw driver error.
async function runGuarded(
  guard: ScheduledRunGuard,
  schedule: string,
  scheduledTime: number,
  work: () => Promise<void>,
): Promise<ScheduledRunOutcome> {
  try {
    return await guard.run(
      schedule,
      Math.floor(scheduledTime / MINUTE_MS),
      work,
    );
  } catch (cause) {
    throw PlumixCliError.cronRunDatabaseUnavailable({
      detail: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
