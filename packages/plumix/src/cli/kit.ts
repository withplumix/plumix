// Separate from `./index.ts`, which pulls in jiti and valibot. Named exports,
// not `export *`, so this stays the documented symbols.
export { CliError, isCliError } from "@plumix/core/cli";
export { spawnCapturingStderr, spawnInherit } from "@plumix/core/cli";
export { migrateBeforeDeploy } from "./commands/migrate.js";
export { applyBuiltMigrations, copyOwnerHistories } from "./migrate/built.js";
export type { ApplyBuiltMigrationsOptions } from "./migrate/built.js";
export { parsePortFlag } from "./port-flag.js";

export type {
  CommandApp,
  CommandContext,
  CommandDefinition,
  CommandRegistry,
  DiagnosticFinding,
  MigrationDatabase,
  MigrationFolder,
  MigrationLocation,
  MigrationRow,
  MigrationStatement,
  OpenMigrationDatabaseOptions,
  RuntimeDiagnose,
  RuntimeMigrations,
} from "@plumix/core";
