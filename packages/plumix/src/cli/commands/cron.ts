import type {
  CommandContext,
  CommandDefinition,
  PlumixApp,
} from "@plumix/core";
import {
  CliError,
  declaredSchedules,
  parseCron,
  scheduledTasksFor,
} from "@plumix/core/cli";

import { report } from "../report.js";

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
      ? // Nothing declares a cron, so every task runs on every firing.
        expression
      : undefined);
  if (fired === undefined) {
    throw CliError.cronRunUnknownSchedule({ expression, declared });
  }

  // Deliberately unguarded: core's run guard lives on the query layer, which
  // the CLI's cold path is held off (`cold-path.test.ts`). One invocation is
  // one run, so an external scheduler owns not overlapping its own — a
  // Kubernetes CronJob wants `concurrencyPolicy: Forbid`, a system crontab
  // wants `flock`. `deployment/node.mdx` says so.
  const handler = ctx.app.config.runtime.createHandler(ctx.app);
  await handler.scheduled?.(
    { scheduledTime: Date.now(), cron: fired },
    { env: process.env },
  );

  const ran = scheduledTasksFor(ctx.app, fired)
    .map((task) => `${task.registeredBy}:${task.id}`)
    .join(", ");
  report.info(`Fired "${fired}": ${ran}`);
}

/** Whitespace is not part of a schedule's identity. */
function normalise(expression: string): string {
  return expression.trim().split(/\s+/).join(" ");
}
