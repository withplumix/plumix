import type { Client, InValue, Transaction } from "@libsql/client";

/**
 * Every row of every application table. Lists tables from SQLite itself to
 * cover unknown plugin tables; D1 only, other `.wrangler/state` is still wiped
 * per suite run.
 */
export interface DbBaseline {
  readonly tables: readonly TableSnapshot[];
}

interface TableSnapshot {
  readonly name: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly InValue[])[];
}

/**
 * SQLite's and miniflare's bookkeeping, and drizzle's applied-migration
 * records, none of which a test changes; `sqlite_sequence` must never be
 * rewound.
 */
const INTERNAL_TABLE_PREFIXES = ["sqlite_", "_cf_", "__drizzle_migrations_"];

/**
 * `table_xinfo` `hidden`: 2 is VIRTUAL, 3 STORED. `SELECT *` returns both and
 * `INSERT` rejects both.
 */
const GENERATED_COLUMN_KINDS = new Set([2, 3]);

async function applicationTables(client: Client): Promise<string[]> {
  // `table_list` tells tables from views, virtual tables and their unprefixed
  // shadow tables; restoring an FTS index's shadows independently corrupts it.
  const listed = await client.execute("PRAGMA table_list");
  return listed.rows
    .filter((row) => row.schema === "main" && row.type === "table")
    .map((row) => row.name)
    .filter((name): name is string => typeof name === "string")
    .filter(
      (name) =>
        !INTERNAL_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix)),
    )
    .sort();
}

async function insertableColumns(
  client: Client,
  table: string,
): Promise<string[]> {
  const info = await client.execute(`PRAGMA table_xinfo("${table}")`);
  return info.rows
    .filter((row) => !GENERATED_COLUMN_KINDS.has(Number(row.hidden)))
    .map((row) => row.name)
    .filter((name): name is string => typeof name === "string");
}

function isEncodedBlob(value: unknown): value is { readonly $blob: string } {
  return typeof value === "object" && value !== null && "$blob" in value;
}

/**
 * libsql reads a BLOB as an `ArrayBuffer`, which has no JSON form, so binary
 * travels as `{ $blob }`, a shape no SQLite value collides with.
 */
export function serializeDbBaseline(baseline: DbBaseline): string {
  return JSON.stringify(baseline, (_key, value: unknown) =>
    value instanceof ArrayBuffer
      ? { $blob: Buffer.from(value).toString("base64") }
      : value,
  );
}

export function parseDbBaseline(text: string): DbBaseline {
  return JSON.parse(text, (_key, value: unknown) =>
    isEncodedBlob(value)
      ? new Uint8Array(Buffer.from(value.$blob, "base64"))
      : value,
  ) as DbBaseline;
}

/**
 * Snapshot the database once seeding is done and before anything drives the
 * site.
 */
export async function captureDbBaseline(client: Client): Promise<DbBaseline> {
  const tables: TableSnapshot[] = [];
  for (const name of await applicationTables(client)) {
    const columns = await insertableColumns(client, name);
    const quoted = columns.map((column) => `"${column}"`).join(", ");
    const result = await client.execute(`SELECT ${quoted} FROM "${name}"`);
    tables.push({
      name,
      columns,
      rows: result.rows.map((row) =>
        columns.map((column) => row[column] as InValue),
      ),
    });
  }
  return { tables };
}

/**
 * Restores under `defer_foreign_keys`: no table order works for a cycle. Never
 * rewinds `sqlite_sequence`, as reused ids leak into URLs. Own the client: a
 * failed statement poisons its connection.
 */
export async function restoreDbBaseline(
  client: Client,
  baseline: DbBaseline,
): Promise<void> {
  const tx = await client.transaction("write");
  try {
    await tx.execute("PRAGMA defer_foreign_keys = ON");
    for (const table of baseline.tables) {
      await tx.execute(`DELETE FROM "${table.name}"`);
    }
    for (const table of baseline.tables) {
      if (table.rows.length === 0) continue;
      const columns = table.columns.map((c) => `"${c}"`).join(", ");
      const placeholders = table.columns.map(() => "?").join(", ");
      const sql = `INSERT INTO "${table.name}" (${columns}) VALUES (${placeholders})`;
      for (const row of table.rows) {
        await tx.execute({ sql, args: [...row] });
      }
    }
    await tx.commit();
  } catch (error) {
    // A deferred check reports only "FOREIGN KEY constraint failed" — no
    // table, no row. Name them before the error leaves worker setup.
    throw await describeConstraintFailure(tx, error);
  } finally {
    // No-op once committed; releases the write lock if anything above threw.
    tx.close();
  }
}

async function describeConstraintFailure(
  tx: Transaction,
  error: unknown,
): Promise<unknown> {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("FOREIGN KEY constraint failed")) return error;
  try {
    const failures = await tx.execute("PRAGMA foreign_key_check");
    const offenders = [
      ...new Set(
        failures.rows
          .map((row) => row[0])
          .filter((table): table is string => typeof table === "string"),
      ),
    ].join(", ");
    return new Error(`${message} — offending tables: ${offenders}`, {
      cause: error,
    });
  } catch {
    return error;
  }
}
