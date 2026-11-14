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
  formatTimeout,
  scheduledTaskTimeoutMs,
  scheduledTasksFor,
} from "../runtime/contract/schedules.js";
// Here so the CLI can report a config mistake without reaching through core's
// root barrel.
export { ConfigError } from "../config.errors.js";
export { contributorRoleSnippet } from "./contributor-role.js";
export { CORE_DATA_MIGRATIONS } from "./data-migrations.js";
export { CORE_MIGRATIONS_FOLDER } from "./migrations.js";
export {
  CORE_SCHEMA_MODULE,
  generateSchemaSource,
  schemaModuleImport,
} from "./schema-codegen.js";
export type { SchemaSource } from "./schema-codegen.js";
export { resolveSiteModule } from "./site-module.js";
export { spawnCapturingStderr, spawnInherit } from "./spawn.js";
