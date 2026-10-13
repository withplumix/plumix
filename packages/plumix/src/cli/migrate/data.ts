import type { MigrationDatabase } from "@plumix/core";
import type { DataMigration } from "@plumix/core/db";
import { CORE_DATA_MIGRATIONS } from "@plumix/core/cli";

import { PlumixCliError } from "../errors.js";
import { report } from "../report.js";

/** One owner's data migrations, in the order they run. */
export interface DataMigrationOwner {
  /** `core`, `site`, or the package name, as schema owners are named. */
  readonly owner: string;
  readonly migrations: readonly DataMigration[];
}

/** Where every owner's applied data migrations are recorded. */
export const DATA_MIGRATIONS_TABLE = "__plumix_data_migrations";

/** Core's list first: it travels with the runner, not through a loader. */
export function withCoreDataMigrations(
  loaded: readonly DataMigrationOwner[],
): readonly DataMigrationOwner[] {
  return [{ owner: "core", migrations: CORE_DATA_MIGRATIONS }, ...loaded];
}

function assertUniqueNames(owners: readonly DataMigrationOwner[]): void {
  for (const { owner, migrations } of owners) {
    const names = new Set<string>();
    for (const { name } of migrations) {
      if (names.has(name)) {
        throw PlumixCliError.migrateDataDuplicateName({ owner, name });
      }
      names.add(name);
    }
  }
}

/** `owner` → its recorded names; empty before the table exists. */
async function appliedDataMigrations(
  db: MigrationDatabase,
): Promise<Map<string, Set<string>>> {
  const applied = new Map<string, Set<string>>();
  const table = await db.all(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${DATA_MIGRATIONS_TABLE}'`,
  );
  if (table.length === 0) return applied;
  const rows = await db.all(
    `SELECT owner, name FROM "${DATA_MIGRATIONS_TABLE}" ORDER BY applied_at`,
  );
  for (const row of rows) {
    const owner = String(row.owner);
    const names = applied.get(owner) ?? new Set<string>();
    applied.set(owner, names);
    names.add(String(row.name));
  }
  return applied;
}

const plural = (count: number): string =>
  `${String(count)} data migration${count === 1 ? "" : "s"}`;

/**
 * Runs each owner's pending data migrations in order, recording each once its
 * `up` resolves. A failure stops the run; the next one retries it.
 */
export async function applyDataMigrations(
  db: MigrationDatabase,
  owners: readonly DataMigrationOwner[],
): Promise<void> {
  assertUniqueNames(owners);
  const declaresAny = owners.some(({ migrations }) => migrations.length > 0);
  if (!declaresAny) return;
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS "${DATA_MIGRATIONS_TABLE}" (owner text NOT NULL, name text NOT NULL, applied_at integer NOT NULL, PRIMARY KEY (owner, name))`,
      params: [],
    },
  ]);
  const applied = await appliedDataMigrations(db);
  for (const { owner, migrations } of owners) {
    if (migrations.length === 0) continue;
    const done = applied.get(owner) ?? new Set<string>();
    const ran: string[] = [];
    for (const migration of migrations) {
      if (done.has(migration.name)) continue;
      try {
        await migration.up({ db: db.drizzle });
      } catch (cause) {
        throw PlumixCliError.migrateDataFailed({
          owner,
          name: migration.name,
          cause,
        });
      }
      await db.batch([
        {
          sql: `INSERT INTO "${DATA_MIGRATIONS_TABLE}" (owner, name, applied_at) VALUES (?, ?, ?)`,
          params: [owner, migration.name, Date.now()],
        },
      ]);
      ran.push(migration.name);
    }
    if (ran.length === 0) {
      report.info(`${owner}: data migrations up to date`);
      continue;
    }
    report.success(`${owner}: applied ${plural(ran.length)}`);
    for (const name of ran) report.info(`  applied ${name}`);
  }
}

/** Each owner that declares data migrations, with what it applied and has pending. */
export async function reportDataStatus(
  db: MigrationDatabase,
  owners: readonly DataMigrationOwner[],
): Promise<void> {
  const applied = await appliedDataMigrations(db);
  for (const { owner, migrations } of owners) {
    if (migrations.length === 0) continue;
    const done = applied.get(owner) ?? new Set<string>();
    const pending = migrations.filter(({ name }) => !done.has(name));
    report.info(
      `${owner}: ${plural(migrations.length - pending.length)} applied, ${String(pending.length)} pending`,
    );
    for (const { name } of migrations) {
      report.info(`  ${done.has(name) ? "applied" : "pending"} ${name}`);
    }
  }
}
