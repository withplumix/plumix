import type { Client, InValue, Transaction } from "@libsql/client";

/**
 * Every row of every application table, as of the moment it was taken.
 *
 * Schema-agnostic on purpose: the table list comes out of SQLite itself
 * rather than a drizzle schema, so it covers plugin tables core has
 * never heard of.
 *
 * D1 only. R2, KV, Durable Object and Cache state also live under
 * `.wrangler/state` and are still wiped once per suite run, not per
 * attempt.
 */
export interface DbBaseline {
  readonly tables: readonly TableSnapshot[];
}

interface TableSnapshot {
  readonly name: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly InValue[])[];
}

// `sqlite_*` is SQLite's own bookkeeping — `sqlite_sequence` above all,
// see `restoreDbBaseline` for why it must not be rewound. `_cf_*` is
// miniflare's D1 bookkeeping, which belongs to the emulator rather than
// to the site.
const INTERNAL_TABLE_PREFIXES = ["sqlite_", "_cf_"];

// `hidden` in `table_xinfo`: 2 is a VIRTUAL generated column, 3 STORED.
// `SELECT *` returns both and `INSERT` rejects both, so a snapshot that
// took its column list from the select would fail to restore.
const GENERATED_COLUMN_KINDS = new Set([2, 3]);

async function applicationTables(client: Client): Promise<string[]> {
  // `table_list` rather than `sqlite_master` because it distinguishes a
  // plain table from a view, a virtual table and a virtual table's shadow
  // tables. Shadow tables carry no prefix that marks them, and restoring
  // an FTS index as if its shadows were independent corrupts it.
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
 * Serialize a baseline so one Playwright worker can hand it to the next.
 *
 * libsql reads a BLOB back as an `ArrayBuffer`, which has no JSON
 * representation — and `credentials.public_key` is a BLOB in every
 * playground. Binary travels as `{ $blob }`, a shape no column value can
 * collide with: SQLite stores only null, integer, real, text and blob.
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
 * Snapshot the database so a later `restoreDbBaseline` can put it back.
 *
 * Intended to run once the seeding is done and before anything drives
 * the site, so the snapshot is the state every attempt should start
 * from.
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
 * Put the database back to a captured baseline.
 *
 * One transaction with `defer_foreign_keys` on, so foreign keys are
 * checked once at commit instead of per statement. Without that the
 * table order would matter — wiping a parent before refilling its
 * children fails immediately — and there is no order that works for a
 * cycle.
 *
 * Deliberately not restored: `sqlite_sequence`. Rewinding the
 * autoincrement counter would hand a fresh row an id an earlier attempt
 * already used, and ids leak out of the database into test ids, URLs and
 * saved fixtures. Letting it keep climbing costs nothing.
 *
 * Pass a client this call can own. A statement that errors mid-transaction
 * stays open on the connection, and every later transaction on it then
 * fails at commit with an unrelated-looking message.
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
