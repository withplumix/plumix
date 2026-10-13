import type { DataMigrationDb } from "../context/app-context.js";

/**
 * One forward-only reshape of stored data. `name` is unique within its owner
 * and is what the run records once `up` resolves; a released one never
 * changes.
 */
export interface DataMigration {
  readonly name: string;
  up(context: { readonly db: DataMigrationDb }): Promise<void>;
}

/** Returns the migration as written, so a test can call its `up` directly. */
export function defineDataMigration(migration: DataMigration): DataMigration {
  return migration;
}
