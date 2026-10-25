import type { AppContext } from "../context/app-context.js";
import type { RegisteredScheduledTask } from "../plugin/registry.js";
import { scheduledTasksFor } from "../runtime/contract/schedules.js";
import { runScheduledTasks } from "../runtime/scheduled.js";

/** Each list holds `plugin:task` ids, in the order the tasks ran. */
interface RunOutcome {
  readonly ran: readonly string[];
  readonly failed: readonly string[];
  readonly timedOut: readonly string[];
}

/**
 * What a firing did with each task it selected. Each assertion returns the
 * report so they chain, and throws a plain `Error` naming what it expected and
 * what it found.
 */
export class TestRunReport implements RunOutcome {
  readonly ran: readonly string[];
  readonly failed: readonly string[];
  readonly timedOut: readonly string[];

  constructor(outcome: RunOutcome) {
    this.ran = outcome.ran;
    this.failed = outcome.failed;
    this.timedOut = outcome.timedOut;
  }

  assertRan(id: string): this {
    return this.#assert("assertRan", id, this.ran, "to have run");
  }

  assertFailed(id: string): this {
    return this.#assert("assertFailed", id, this.failed, "to have failed");
  }

  assertTimedOut(id: string): this {
    return this.#assert(
      "assertTimedOut",
      id,
      this.timedOut,
      "to have timed out",
    );
  }

  #assert(
    name: string,
    id: string,
    ids: readonly string[],
    expectation: string,
  ): this {
    if (ids.includes(id)) return this;
    throw new Error(
      `${name}: expected "${id}" ${expectation}, but ${this.#describe(id)}.\n` +
        `ran: ${list(this.ran)}; failed: ${list(this.failed)}; timed out: ${list(this.timedOut)}`,
    );
  }

  #describe(id: string): string {
    if (this.ran.includes(id)) return "it ran";
    if (this.failed.includes(id)) return "it failed";
    if (this.timedOut.includes(id)) return "it timed out";
    return "the firing did not select it";
  }
}

/** The site's registered tasks, asserted on without reading the registry. */
export interface TestSchedule {
  /** `id` is `plugin:task`, as the run report names it. */
  readonly assertScheduled: (id: string, cron: string) => void;
}

export function scheduleOf(
  tasks: readonly RegisteredScheduledTask[],
): TestSchedule {
  return {
    assertScheduled: (id, cron) => {
      const task = findTask(tasks, id, "assertScheduled");
      if (task.cron === cron) return;
      throw new Error(
        task.cron === undefined
          ? `assertScheduled: expected "${id}" on "${cron}", but it declares no cron and runs on every firing.`
          : `assertScheduled: expected "${id}" on "${cron}", but it is on "${task.cron}".`,
      );
    },
  };
}

/** The task `plugin:task` names, or an `Error` listing the registered ones. */
export function findTask(
  tasks: readonly RegisteredScheduledTask[],
  id: string,
  caller: string,
): RegisteredScheduledTask {
  const task = tasks.find((candidate) => labelOf(candidate) === id);
  if (task !== undefined) return task;
  throw new Error(
    `${caller}: no scheduled task "${id}". Registered: ${list(tasks.map(labelOf))}.`,
  );
}

/**
 * Through core's own run, so the task gets its budget and its span, and the
 * CDN purge is flushed after. Omitting `firedCron` runs every task given.
 */
export async function runTasks(
  tasks: readonly RegisteredScheduledTask[],
  ctx: AppContext,
  firedCron?: string,
): Promise<TestRunReport> {
  const app = { scheduledTasks: tasks };
  const report = await runScheduledTasks(app, ctx, firedCron);
  // Narrows the report; this run never returns the aborted arm.
  if (report.aborted !== undefined) throw new Error(report.aborted);
  const { failed, timedOut } = report;
  return new TestRunReport({
    ran: scheduledTasksFor(app, firedCron)
      .map(labelOf)
      .filter((id) => !failed.includes(id) && !timedOut.includes(id)),
    failed,
    timedOut,
  });
}

function labelOf(task: RegisteredScheduledTask): string {
  return `${task.registeredBy}:${task.id}`;
}

function list(ids: readonly string[]): string {
  return ids.length === 0 ? "none" : ids.map((id) => `"${id}"`).join(", ");
}
