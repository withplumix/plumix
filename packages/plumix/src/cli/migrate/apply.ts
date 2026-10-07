import { readMigrationFiles } from "drizzle-orm/migrator";

import type { MigrationDatabase } from "@plumix/core";

import type { MigrationOwner } from "./owners.js";
import { PlumixCliError } from "../errors.js";
import { report } from "../report.js";

async function tableExists(
  db: MigrationDatabase,
  table: string,
): Promise<boolean> {
  const rows = await db.all(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${quote(table)}`,
  );
  return rows.length > 0;
}

/** The migrations an owner's tracking table records, oldest first. */
async function appliedMigrations(
  db: MigrationDatabase,
  owner: MigrationOwner,
): Promise<readonly { hash: string; createdAt: number }[]> {
  if (!(await tableExists(db, owner.migrationsTable))) return [];
  const rows = await db.all(
    `SELECT hash, created_at FROM "${owner.migrationsTable}" ORDER BY created_at`,
  );
  return rows.map((row) => ({
    hash: String(row.hash),
    createdAt: Number(row.created_at),
  }));
}

/** Apply each owner's pending migrations in order, reporting what each took. */
export async function applyOwners(
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
): Promise<void> {
  for (const owner of owners) {
    const before = (await appliedMigrations(db, owner)).length;
    await db.migrate(owner);
    const applied = (await appliedMigrations(db, owner)).length - before;
    if (applied === 0) {
      report.info(`${owner.name}: up to date`);
    } else {
      report.success(
        `${owner.name}: applied ${String(applied)} migration${applied === 1 ? "" : "s"}`,
      );
    }
  }
}

function describeMigration(
  state: string,
  createdAt: number,
  hash: string,
): string {
  return `  ${state} ${new Date(createdAt).toISOString()} ${hash.slice(0, 8)}`;
}

/** Each owner in order, with the migrations it has applied and has pending. */
export async function reportStatus(
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
): Promise<void> {
  for (const owner of owners) {
    const applied = await appliedMigrations(db, owner);
    // drizzle applies whatever is newer than the newest it recorded.
    const newest = applied.at(-1)?.createdAt ?? -Infinity;
    const pending = readMigrationFiles(owner).filter(
      (migration) => migration.folderMillis > newest,
    );
    report.info(
      `${owner.name}: ${String(applied.length)} applied, ${String(pending.length)} pending`,
    );
    for (const migration of applied) {
      report.info(
        describeMigration("applied", migration.createdAt, migration.hash),
      );
    }
    for (const migration of pending) {
      report.info(
        describeMigration("pending", migration.folderMillis, migration.hash),
      );
    }
  }
}

// Bookkeeping that belongs to SQLite, miniflare's D1, or a migrator, rather
// than to any owner's schema.
const BOOKKEEPING_PREFIXES = ["sqlite_", "_cf_", "__drizzle_migrations"];

async function trackingTables(db: MigrationDatabase): Promise<unknown[]> {
  const rows = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '\\_\\_drizzle\\_migrations\\_%' ESCAPE '\\'",
  );
  return rows.map((row) => row.name);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Every table, index and trigger, keyed `<type> <name>`: a table by its
 * columns, the rest by their SQL with whitespace collapsed.
 */
async function schemaOf(
  db: MigrationDatabase,
  legacyTable: string,
): Promise<Map<string, Map<string, string>>> {
  const objects = await db.all(
    "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') ORDER BY name",
  );
  const schema = new Map<string, Map<string, string>>();
  for (const object of objects) {
    const name = String(object.name);
    if (name === legacyTable) continue;
    if (BOOKKEEPING_PREFIXES.some((prefix) => name.startsWith(prefix)))
      continue;
    const parts = new Map<string, string>();
    if (object.type === "table") {
      const columns = await db.all(
        `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(${quote(name)})`,
      );
      for (const column of columns) {
        const notNull = Number(column.notnull) === 1 ? " NOT NULL" : "";
        const fallback =
          typeof column.dflt_value === "string"
            ? ` DEFAULT ${column.dflt_value}`
            : "";
        const pk = Number(column.pk) > 0 ? " PRIMARY KEY" : "";
        parts.set(
          `column "${String(column.name)}"`,
          `${String(column.type)}${notNull}${fallback}${pk}`.trim(),
        );
      }
    } else {
      const sql = typeof object.sql === "string" ? object.sql : "";
      parts.set("sql", sql.replace(/\s+/g, " ").trim());
    }
    schema.set(`${String(object.type)} ${name}`, parts);
  }
  return schema;
}

function differences(
  expected: Map<string, Map<string, string>>,
  actual: Map<string, Map<string, string>>,
): string[] {
  const found: string[] = [];
  for (const [object, want] of expected) {
    const have = actual.get(object);
    if (have === undefined) {
      found.push(`${object} is missing`);
      continue;
    }
    for (const [part, value] of want) {
      const other = have.get(part);
      if (other === undefined) found.push(`${object}: ${part} is missing`);
      else if (other !== value) {
        found.push(
          `${object}: ${part} is "${other}", the histories have "${value}"`,
        );
      }
    }
    for (const [part, value] of have) {
      if (!want.has(part)) {
        found.push(`${object}: ${part} (${value}) is not in the histories`);
      }
    }
  }
  for (const object of actual.keys()) {
    if (!expected.has(object)) found.push(`${object} is not in the histories`);
  }
  return found;
}

/**
 * Adopt a database the site's single legacy history built: when its schema
 * matches every owner's history applied to a scratch database exactly, record
 * each owner's migrations as applied rather than run them. The one place
 * Plumix writes drizzle's tracking table (ADR 0027).
 */
export async function adoptLegacyDatabase(
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  legacyTable: string,
  openScratch: () => Promise<MigrationDatabase>,
): Promise<void> {
  const legacy = await db.all(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${quote(legacyTable)}`,
  );
  if (legacy.length === 0 || (await trackingTables(db)).length > 0) return;

  const scratch = await openScratch();
  let expected: Map<string, Map<string, string>>;
  try {
    for (const owner of owners) await scratch.migrate(owner);
    expected = await schemaOf(scratch, legacyTable);
  } finally {
    await scratch.close();
  }
  const found = differences(expected, await schemaOf(db, legacyTable));
  if (found.length > 0) {
    throw PlumixCliError.migrateAdoptionMismatch({ differences: found });
  }

  // drizzle's own tracking-table DDL and row, as its migrator writes them.
  await db.batch(
    owners.flatMap((owner) => [
      {
        sql: `CREATE TABLE IF NOT EXISTS "${owner.migrationsTable}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
        params: [],
      },
      ...readMigrationFiles(owner).map((migration) => ({
        sql: `INSERT INTO "${owner.migrationsTable}" ("hash", "created_at") VALUES (?, ?)`,
        params: [migration.hash, migration.folderMillis],
      })),
    ]),
  );
  report.success(
    `Adopted this database: its schema matches ${owners.map((owner) => owner.name).join(", ")}, so their migrations are recorded as applied. The site's drizzle/ folder is no longer read.`,
  );
}
