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

/**
 * A stable version tag for the bootstrap SQL (schema migrations + seed),
 * stamped into the ready marker. When a deploy changes the schema or seed the
 * tag changes, so a DO persisted with the old bootstrap re-initializes on its
 * next request instead of serving a stale schema (which would break any query
 * touching a new column). FNV-1a — cheap, synchronous, dependency-free; only
 * change-detection is needed, not cryptographic strength.
 */
function bootstrapVersion(bootstrapSql: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bootstrapSql.length; i += 1) {
    hash ^= bootstrapSql.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

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
 * to a demo database. Idempotent *at a version*: a database already bootstrapped
 * from the same SQL is left untouched, so re-entry (a second request racing the
 * first, or a persisted DO revived after eviction) neither throws nor duplicates
 * seed rows. When the bootstrap SQL differs from what the marker records — a
 * deploy changed the schema or seed — the stale tables are dropped and the new
 * bootstrap is applied, so a persisted showcase DO heals itself rather than
 * serving an outdated schema. Returns whether it (re)initialized.
 */
export async function initializeDemoStorage(
  sql: DemoSqlExecutor,
  bootstrapSql: string,
): Promise<boolean> {
  const version = bootstrapVersion(bootstrapSql);
  if (await isInitializedAtVersion(sql, version)) return false;
  // Fresh DO, a previously-failed partial bootstrap, or a stale schema/seed
  // from an earlier deploy: drop everything (including any old marker) so the
  // re-apply starts clean rather than tripping `CREATE TABLE` on an existing
  // table. Dropping the stale schema is what heals a persisted showcase DO.
  await dropDemoTables(sql);
  for (const statement of splitStatements(bootstrapSql)) {
    await sql.exec(statement);
  }
  // Written last and stamped with the version: only a fully-applied bootstrap
  // is marked ready (a partial failure leaves no marker and re-runs), and a
  // later deploy whose SQL differs sees the mismatch and re-bootstraps.
  await sql.exec(`CREATE TABLE ${READY_TABLE} (version TEXT NOT NULL)`);
  await sql.exec(`INSERT INTO ${READY_TABLE} (version) VALUES ('${version}')`);
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

async function isInitializedAtVersion(
  sql: DemoSqlExecutor,
  version: string,
): Promise<boolean> {
  try {
    const rows = await sql.query(`SELECT version FROM ${READY_TABLE} LIMIT 1`);
    return rows[0]?.version === version;
  } catch {
    // No marker table (a fresh DO), or a pre-versioning marker with no
    // `version` column (bootstrapped by an older deploy) — either way, treat
    // it as stale and (re)bootstrap from the current SQL.
    return false;
  }
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
