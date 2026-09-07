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
  CliError,
  declaredSchedules,
  parseCron,
  scheduledTasksFor,
} from "@plumix/core/cli";

import { report } from "../report.js";

const MINUTE_MS = 60_000;

/** What the scheduler fires when no task declares a cron of its own. */
const EVERY_MINUTE = "* * * * *";

export const cronCommand: CommandDefinition = {
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
    throw CliError.unknownSubcommand({
      command: "cron",
      subcommand: sub,
      supported: ["list", "run"],
    });
  },
};

/**
 * What an external scheduler has to fire, printed rather than guessed.
 *
 * Plugins contribute schedules, so a crontab written by hand goes stale the
 * moment a site installs one — the failure Cloudflare deploys already have,
 * where a task whose cron does not match a declared trigger never runs and
 * says nothing.
 */
function listSchedules(app: PlumixApp): void {
  if (app.scheduledTasks.length === 0) {
    report.info("This site declares no scheduled tasks.");
    return;
  }

  const schedules = declaredSchedules(app);
  if (schedules.length === 0) {
    // Every task runs on every firing, so there is no declared schedule to
    // print — but there is still work, and an operator told "none" would wire
    // up nothing and never run it.
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

async function runSchedule(ctx: CommandContext): Promise<void> {
  const expression = ctx.argv[1];
  if (expression === undefined || expression === "") {
    throw CliError.cronRunMissingExpression();
  }
  // Rejects before any work: a malformed expression here would otherwise match
  // nothing and exit green.
  try {
    parseCron(expression);
  } catch (cause) {
    throw CliError.cronRunInvalidExpression({
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
    throw CliError.cronRunUnknownSchedule({ expression, declared });
  }

  // Dynamic, so `src/cli/index.ts`'s static import of this module cannot put
  // core's root barrel on every `plumix` invocation — `dev` opts out of
  // building an app and must not pay for it (`cold-start.test.ts`). Here it is
  // a module-cache hit: `resolveCommandApp` already imported the barrel to
  // build `ctx.app`.
  const { connectScheduledDb, createScheduledRunGuard } =
    await import("@plumix/core");
  const handler = ctx.app.config.runtime.createHandler(ctx.app);

  // `nodeSqlite` resolves its path against the process cwd, so `--cwd` has to
  // land before anything opens a database — otherwise this creates an empty one
  // beside wherever the command was invoked from.
  if (ctx.cwd !== process.cwd()) process.chdir(ctx.cwd);

  const db = connectScheduledDb(ctx.app, process.env);
  const guard = createScheduledRunGuard({
    db,
    // Names this invocation in the lease row; every pod of a CronJob would
    // otherwise write the same string.
    holder: `cli:${hostname()}:${String(process.pid)}`,
    lease: true,
    // The same policy the in-process scheduler picks: a task that declares no
    // cron runs on every firing, so its schedules must serialise against each
    // other; without one, a slow schedule cannot shut an unrelated one out of
    // its only matching minute.
    leaseScope: ctx.app.scheduledTasks.some((task) => task.cron === undefined)
      ? "shared"
      : "schedule",
  });

  await fireSchedule(ctx, guard, fired, handler);
}

async function fireSchedule(
  ctx: CommandContext,
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
    throw CliError.cronRunNeverStarted({
      expression: fired,
      reason: runReport.aborted,
    });
  }
  // An adapter that reported nothing failed nothing.
  const failed = runReport?.failed ?? [];
  if (failed.length > 0) {
    throw CliError.cronRunTasksFailed({ expression: fired, failed });
  }

  const ran = scheduledTasksFor(ctx.app, fired)
    .map((task) => `${task.registeredBy}:${task.id}`)
    .join(", ");
  report.info(`Fired "${fired}": ${ran}`);
}

/** Whitespace is not part of a schedule's identity. */
function normalise(expression: string): string {
  return expression.trim().split(/\s+/).join(" ");
}

/**
 * Run `work` under the guard, turning a database failure into a CliError.
 *
 * The guard is the first thing here to touch the database, so an install that
 * has not run `plumix migrate apply` since upgrading would otherwise meet a raw
 * driver message and a stack trace. Every other way this command fails names
 * its fix.
 */
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
    throw CliError.cronRunDatabaseUnavailable({
      detail: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }
}
