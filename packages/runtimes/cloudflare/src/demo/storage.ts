/**
 * Demo-session database lifecycle, expressed against a minimal SQL
 * interface so it can run on a Durable Object's synchronous `SqlStorage`
 * in production and an in-memory SQLite in tests. The DO wrapper
 * ({@link DemoDB}) adapts `ctx.storage.sql` to this interface.
 */

/** Table names we're willing to interpolate into DROP statements. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

export interface DemoSqlExecutor {
  /** Run a multi-statement SQL script (schema, seed, drops). No bindings. */
  runScript(sql: string): Promise<void>;
  /** Run a single read statement, returning its rows. */
  query(sql: string): Promise<readonly Record<string, unknown>[]>;
}

export interface DemoSeed {
  readonly schemaSql: string;
  readonly seedSql: string;
}

/**
 * Apply schema then seed to a fresh demo database. Idempotent: a database
 * that already has user tables is left untouched, so re-entry (a second
 * request racing the first, or a persisted DO revived after eviction)
 * neither throws nor duplicates seed rows. Returns whether it initialized.
 */
export async function initializeDemoStorage(
  sql: DemoSqlExecutor,
  seed: DemoSeed,
): Promise<boolean> {
  if (await hasUserTables(sql)) return false;
  await sql.runScript(seed.schemaSql);
  await sql.runScript(seed.seedSql);
  return true;
}

/**
 * Drop every user table to reclaim storage when a demo session expires.
 * Foreign keys are disabled first so drop order can't trip cascade
 * constraints. Cloudflare and SQLite internal tables are preserved.
 *
 * Note: SQLite ignores `PRAGMA foreign_keys` inside a transaction, and a DO
 * coalesces a turn's writes into one — so under workerd the OFF may not take
 * effect. It works in the libsql test (runs outside a txn) and mirrors
 * emdash's shipped cleanup; verify the FK-enforced path against a real DO
 * when the spine slice (#1342) exercises seeds with foreign keys.
 */
export async function dropDemoTables(sql: DemoSqlExecutor): Promise<void> {
  const names = (await listUserTables(sql)).filter((name) =>
    SAFE_IDENTIFIER.test(name),
  );
  if (names.length === 0) return;
  const drops = names.map((name) => `DROP TABLE IF EXISTS "${name}";`);
  await sql.runScript(
    ["PRAGMA foreign_keys = OFF;", ...drops, "PRAGMA foreign_keys = ON;"].join(
      "\n",
    ),
  );
}

async function hasUserTables(sql: DemoSqlExecutor): Promise<boolean> {
  const rows = await sql.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' LIMIT 1",
  );
  return rows.length > 0;
}

async function listUserTables(sql: DemoSqlExecutor): Promise<string[]> {
  const rows = await sql.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  );
  return rows.map((row) => String(row.name));
}
