/**
 * Demo-session database lifecycle, expressed against a minimal SQL
 * interface so it can run on a Durable Object's synchronous `SqlStorage`
 * in production and an in-memory SQLite in tests. The DO wrapper
 * ({@link DemoDB}) adapts `ctx.storage.sql` to this interface.
 */

/** Table names we're willing to interpolate into DROP statements. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/** Marker table written after a successful bootstrap, checked for idempotency. */
const READY_TABLE = "_plumix_demo_ready";

export interface DemoSqlExecutor {
  /** Run a single SQL statement (no bindings). */
  exec(sql: string): Promise<void>;
  /** Run a single read statement, returning its rows. */
  query(sql: string): Promise<readonly Record<string, unknown>[]>;
}

/**
 * Split a multi-statement SQL script into individual statements. Durable
 * Object `SqlStorage.exec` only runs the first statement of a script, so
 * bootstrap SQL (drizzle migrations + seed) must be applied one statement at
 * a time. Respects single-quoted string literals and `--` line comments so a
 * `;` inside either doesn't split a statement, and drops drizzle's
 * `--> statement-breakpoint` markers.
 */
export function splitStatements(script: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let inComment = false;
  for (let i = 0; i < script.length; i += 1) {
    const ch = script[i];
    if (inComment) {
      if (ch === "\n") inComment = false;
      current += ch;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString && ch === "-" && script[i + 1] === "-") {
      inComment = true;
      current += ch;
      continue;
    }
    if (!inString && ch === ";") {
      const statement = stripStatement(current);
      if (statement) statements.push(statement);
      current = "";
      continue;
    }
    current += ch;
  }
  const tail = stripStatement(current);
  if (tail) statements.push(tail);
  return statements;
}

function stripStatement(statement: string): string {
  return statement.replace(/-->\s*statement-breakpoint/g, "").trim();
}

/**
 * Apply the bootstrap SQL (schema migrations + seed content, concatenated)
 * to a fresh demo database. Idempotent: a database that already has user
 * tables is left untouched, so re-entry (a second request racing the first,
 * or a persisted DO revived after eviction) neither throws nor duplicates
 * seed rows. Returns whether it initialized.
 */
export async function initializeDemoStorage(
  sql: DemoSqlExecutor,
  bootstrapSql: string,
): Promise<boolean> {
  if (await isInitialized(sql)) return false;
  // Clear any tables a previously-failed bootstrap left behind, so a retry
  // starts from an empty database rather than tripping `CREATE TABLE` on an
  // already-existing table. A no-op on a fresh DO.
  await dropDemoTables(sql);
  for (const statement of splitStatements(bootstrapSql)) {
    await sql.exec(statement);
  }
  // Written last: only a fully-applied bootstrap is marked ready, so a partial
  // failure leaves no marker and the next attempt re-runs from scratch.
  await sql.exec(`CREATE TABLE ${READY_TABLE} (ready INTEGER)`);
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
 * emdash's shipped cleanup; verify the FK-enforced path against a real DO if a
 * seed's foreign keys ever block teardown.
 */
export async function dropDemoTables(sql: DemoSqlExecutor): Promise<void> {
  const names = (await listUserTables(sql)).filter((name) =>
    SAFE_IDENTIFIER.test(name),
  );
  if (names.length === 0) return;
  await sql.exec("PRAGMA foreign_keys = OFF");
  for (const name of names) {
    await sql.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  await sql.exec("PRAGMA foreign_keys = ON");
}

async function isInitialized(sql: DemoSqlExecutor): Promise<boolean> {
  const rows = await sql.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '${READY_TABLE}' LIMIT 1`,
  );
  return rows.length > 0;
}

async function listUserTables(sql: DemoSqlExecutor): Promise<string[]> {
  // Exclude SQLite (`sqlite_%`), Cloudflare (`_cf_%`), and miniflare-in-dev
  // (`__miniflare_%`, matched by the `__*` GLOB) internal tables so cleanup
  // never drops them.
  const rows = await sql.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT GLOB '__*'",
  );
  return rows.map((row) => String(row.name));
}
