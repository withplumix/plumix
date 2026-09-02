export { CliError, isCliError } from "./errors.js";
export {
  collectRawSqlMigrations,
  planRawSqlMigrations,
} from "./raw-migrations.js";
export { CORE_SCHEMA_MODULE, generateSchemaSource } from "./schema-codegen.js";
export type { SchemaSource } from "./schema-codegen.js";
export { spawnCapturingStderr, spawnInherit } from "./spawn.js";
