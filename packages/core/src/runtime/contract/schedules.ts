interface Scheduled {
  readonly cron?: string;
}

/**
 * A task without a `cron` runs on every firing. Omitting `firedCron` selects
 * every task.
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

/**
 * The distinct schedules a site declares, in the order tasks registered them.
 */
export function declaredSchedules(app: {
  readonly scheduledTasks: readonly Scheduled[];
}): readonly string[] {
  const seen = new Set<string>();
  for (const task of app.scheduledTasks) {
    if (task.cron !== undefined) seen.add(task.cron);
  }
  return [...seen];
}
