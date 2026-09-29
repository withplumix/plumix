import { hostname } from "node:os";
import type {
  ScheduledRunnerOptions as RunnerOptions,
  Scheduler,
} from "plumix/runtime";
import { startScheduledRunner as startRunner } from "plumix/runtime";

export type ScheduledRunnerOptions = Omit<RunnerOptions, "holder">;

/**
 * Core's scheduled runner, holding the lease as this host and process, so a
 * lease row read back names the replica that took it.
 */
export function startScheduledRunner(
  options: ScheduledRunnerOptions,
): Scheduler {
  return startRunner({
    ...options,
    holder: `${hostname()}:${String(process.pid)}`,
  });
}
