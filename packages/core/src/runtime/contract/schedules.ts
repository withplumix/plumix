/** What the schedule rules read off a registered task. */
interface Scheduled {
  readonly cron?: string;
}

/**
 * Which tasks a firing runs. A task with a declared `cron` runs only on its
 * own schedule; one that declared none runs on every firing. `firedCron`
 * omitted means every task, which is what a caller with no schedule in hand
 * wants (tests, a runtime that cannot say which trigger woke it).
 *
 * Its own module rather than part of `scheduled.ts`, whose import graph pulls
 * in purge and telemetry delivery — a weight the CLI, which needs only this
 * rule, should not carry onto its cold path.
 */
export function scheduledTasksFor<TTask extends Scheduled>(
  app: { readonly scheduledTasks: readonly TTask[] },
  firedCron?: string,
): readonly TTask[] {
  return app.scheduledTasks.filter(
    (task) =>
      firedCron === undefined ||
      task.cron === undefined ||
      task.cron === firedCron,
  );
}

/** The distinct schedules a site declares, in the order tasks registered them. */
export function declaredSchedules(app: {
  readonly scheduledTasks: readonly Scheduled[];
}): readonly string[] {
  const seen = new Set<string>();
  for (const task of app.scheduledTasks) {
    if (task.cron !== undefined) seen.add(task.cron);
  }
  return [...seen];
}
