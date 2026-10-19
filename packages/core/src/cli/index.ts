export { CliError, isCliError } from "./errors.js";
export {
  assertSameHeads,
  CORE_SYNC_SCOPE_TABLES,
  headDifferences,
  readSyncHeads,
  SYNC_AUTH_TABLES,
  SyncError,
} from "./sync.js";
export type { SyncHeadsAt } from "./sync.js";
export { resolveScopes } from "./sync-scopes.js";
export { databaseSyncEnd } from "./sync-end.js";
export type { DatabaseSyncEndOptions } from "./sync-end.js";
export { remoteSyncEnd } from "./sync-remote.js";
export type { RemoteSyncEndOptions } from "./sync-remote.js";
export { settleSync } from "../context/settle-sync.js";
// Re-exported here so a CLI command can validate a schedule without reaching
// through core's root barrel, which the cold-start guard keeps off this path.
export type { CronSchedule } from "../runtime/contract/cron.js";
export { CronSyntaxError, parseCron } from "../runtime/contract/cron.js";
export {
  declaredSchedules,
  scheduledTasksFor,
} from "../runtime/contract/schedules.js";
export { CORE_DATA_MIGRATIONS } from "./data-migrations.js";
export { CORE_MIGRATIONS_FOLDER } from "./migrations.js";
export { CORE_SCHEMA_MODULE, generateSchemaSource } from "./schema-codegen.js";
export type { SchemaSource } from "./schema-codegen.js";
export { spawnCapturingStderr, spawnInherit } from "./spawn.js";
