// Separate from `./index.ts`, which pulls in jiti and valibot. Named exports,
// not `export *`, so this stays the documented symbols.
export { CliError, isCliError } from "@plumix/core/cli";
export {
  assertSameHeads,
  readSyncHeads,
  settleSync,
  SyncError,
} from "@plumix/core/cli";
export { spawnCapturingStderr, spawnInherit } from "@plumix/core/cli";
export { migrateBeforeDeploy } from "./commands/migrate.js";
export { applyBuiltMigrations, copyOwnerHistories } from "./migrate/built.js";
export type { ApplyBuiltMigrationsOptions } from "./migrate/built.js";
export { parsePortFlag } from "./port-flag.js";
export { settleDeployedSite } from "./sync/settle-remote.js";

export type {
  CommandApp,
  CommandContext,
  CommandDefinition,
  CommandRegistry,
  DiagnosticFinding,
  DumpManifest,
  DumpReader,
  DumpTableCount,
  DumpWriter,
  MigrationDatabase,
  MigrationDatabaseTarget,
  MigrationFolder,
  MigrationLocation,
  MigrationOwner,
  MigrationRow,
  MigrationStatement,
  OpenMigrationDatabaseOptions,
  OpenRunOptions,
  OpenSyncEndOptions,
  RuntimeDiagnose,
  RuntimeMigrations,
  RuntimeSync,
  RuntimeTargetOption,
  RuntimeTargetOptions,
  RunEnvironment,
  SyncAfterEvent,
  SyncDependentReport,
  SyncDirection,
  SyncEnd,
  SyncImportReport,
  SyncObject,
  SyncRow,
  SyncScope,
  SyncScopeTable,
  SyncSettleFailure,
  SyncSettleReport,
  SyncSnapshot,
  SyncTableReport,
  SyncTarget,
  SyncValue,
  TargetOptionValues,
} from "@plumix/core";
export type { SyncHeadsAt } from "@plumix/core/cli";
