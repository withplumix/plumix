export { CliError, isCliError } from "./errors.js";
// Re-exported here so a CLI command can validate a schedule without reaching
// through core's root barrel, which the cold-start guard keeps off this path.
export type { CronSchedule } from "../runtime/contract/cron.js";
export { CronSyntaxError, parseCron } from "../runtime/contract/cron.js";
export {
  declaredSchedules,
  scheduledTasksFor,
} from "../runtime/contract/schedules.js";
export { CORE_MIGRATIONS_FOLDER } from "./migrations.js";
export { CORE_SCHEMA_MODULE, generateSchemaSource } from "./schema-codegen.js";
export type { SchemaSource } from "./schema-codegen.js";
export { spawnCapturingStderr, spawnInherit } from "./spawn.js";
