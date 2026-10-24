interface Scheduled {
  readonly cron?: string;
  readonly timeoutMs?: number;
}

/** The same on every runtime; on Workers it fires before the platform's limit. */
const DEFAULT_SCHEDULED_TASK_TIMEOUT_MS = 5 * 60_000;

/** How long a firing waits for the task before it moves on. */
export function scheduledTaskTimeoutMs(task: Scheduled): number {
  return task.timeoutMs ?? DEFAULT_SCHEDULED_TASK_TIMEOUT_MS;
}

/** A budget as a report names it: `5m`, or `1.5s` when not whole minutes. */
export function formatTimeout(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000}m` : `${ms / 1000}s`;
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
