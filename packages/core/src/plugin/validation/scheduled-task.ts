import { PluginContextError } from "../errors.js";
import type { ScheduledTask } from "../manifest.js";

const SCHEDULED_TASK_ID_RE = /^[a-z0-9][a-z0-9_/-]{0,63}$/i;

export function assertValidScheduledTask(
  pluginId: string,
  task: ScheduledTask,
): void {
  if (!SCHEDULED_TASK_ID_RE.test(task.id)) {
    throw PluginContextError.invalidScheduledTaskId({ pluginId, id: task.id });
  }
  if (typeof task.handler !== "function") {
    throw PluginContextError.scheduledTaskHandlerMissing({
      pluginId,
      id: task.id,
    });
  }
}
