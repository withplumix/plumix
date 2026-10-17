// Written against a minimal SQL interface so it runs on a DO's synchronous
// `SqlStorage` and on in-memory SQLite in tests.

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

const READY_TABLE = "_plumix_demo_ready";

/**
 * A DO persisted with an older bootstrap re-initializes instead of serving a
 * stale schema. FNV-1a: change detection only, not cryptographic strength.
 */
function bootstrapVersion(bootstrapSql: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bootstrapSql.length; i += 1) {
    hash ^= bootstrapSql.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Not JSON: a blob column arrives as an `ArrayBuffer`, which no serializer
 * round trips.
 */
type DemoSqlRow = Record<string, unknown>;

export interface DemoSqlExecutor {
  /** Run a single SQL statement (no bindings). */
  exec(sql: string): Promise<void>;
  /** Run a single read statement, returning its rows. */
  query(sql: string): Promise<readonly DemoSqlRow[]>;
}

/**
 * `end` is only the keyword when it stands alone: an identifier like `x2end`
 * must not read as one, so a digit keeps the word going.
 */
const WORD_CHAR = /[A-Za-z0-9_]/;

/**
 * Quoted spans, whichever delimiter drizzle or a plugin reached for. A `;`
 * inside one doesn't split, and a word inside one is never a keyword.
 */
const QUOTES = new Set(["'", '"', "`"]);

/**
 * DO `SqlStorage.exec` runs only a script's first statement. Semicolons inside
 * quotes, `--` comments and trigger bodies don't split; `BEGIN TRANSACTION`
 * does.
 */
export function splitStatements(script: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let inComment = false;
  let word = "";
  let isTrigger = false;
  let blockDepth = 0;

  function endWord(): void {
    const keyword = word.toUpperCase();
    word = "";
    if (keyword === "TRIGGER") isTrigger = true;
    else if (isTrigger && (keyword === "BEGIN" || keyword === "CASE")) {
      blockDepth += 1;
    } else if (keyword === "END" && blockDepth > 0) blockDepth -= 1;
  }

  for (let i = 0; i < script.length; i += 1) {
    const ch = script.charAt(i);
    if (inComment) {
      if (ch === "\n") inComment = false;
      current += ch;
      continue;
    }
    if (quote === null && WORD_CHAR.test(ch)) {
      word += ch;
      current += ch;
      continue;
    }
    // Everything below is a word boundary by definition.
    endWord();
    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (QUOTES.has(ch)) {
      quote = ch;
    } else if (ch === "-" && script[i + 1] === "-") {
      inComment = true;
    } else if (ch === ";" && blockDepth === 0) {
      const statement = stripStatement(current);
      if (statement) statements.push(statement);
      current = "";
      isTrigger = false;
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
 * Idempotent at a version, so racing requests and revived DOs neither throw
 * nor duplicate seed rows; changed SQL drops and re-applies. Returns whether
 * it (re)initialized.
 */
export async function initializeDemoStorage(
  sql: DemoSqlExecutor,
  bootstrapSql: string,
): Promise<boolean> {
  const version = bootstrapVersion(bootstrapSql);
  if (await isInitializedAtVersion(sql, version)) return false;
  // Drop everything first so re-applying doesn't trip `CREATE TABLE` on an
  // existing table.
  await dropDemoTables(sql);
  for (const statement of splitStatements(bootstrapSql)) {
    await sql.exec(statement);
  }
  // Written last, so a partial failure leaves no marker and re-runs.
  await sql.exec(`CREATE TABLE ${READY_TABLE} (version TEXT NOT NULL)`);
  await sql.exec(`INSERT INTO ${READY_TABLE} (version) VALUES ('${version}')`);
  return true;
}

/**
 * A DO wraps a turn's writes in one transaction, where SQLite ignores
 * `PRAGMA foreign_keys`, so the drops defer the checks instead: that lasts only
 * until the commit.
 */
export async function dropDemoTables(sql: DemoSqlExecutor): Promise<void> {
  const names = await listUserObjects(sql, "table");
  if (names.length === 0) return;
  await sql.exec("PRAGMA defer_foreign_keys = ON");
  // A drop's `set null` and cascades fire triggers, which fail to compile once
  // a table they write to is gone.
  for (const name of await listUserObjects(sql, "trigger")) {
    await sql.exec(`DROP TRIGGER IF EXISTS "${name}"`);
  }
  for (const name of await childrenFirst(sql, names)) {
    await sql.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
}

/**
 * With foreign keys on, SQLite fails to compile a child's drop once a parent it
 * references is gone, so a table drops after every table that references it.
 */
async function childrenFirst(
  sql: DemoSqlExecutor,
  names: readonly string[],
): Promise<string[]> {
  // A DO refuses the `pragma_foreign_key_list()` table-valued form.
  const parents = new Map<string, Set<string>>();
  for (const name of names) {
    const references = await sql.query(`PRAGMA foreign_key_list("${name}")`);
    parents.set(name, new Set(references.map((row) => String(row.table))));
  }
  const ordered: string[] = [];
  let remaining = [...names];
  while (remaining.length > 0) {
    const unreferenced = remaining.filter(
      (name) =>
        !remaining.some(
          (other) => other !== name && parents.get(other)?.has(name),
        ),
    );
    // A reference cycle leaves none unreferenced: drop the rest as listed.
    const next = unreferenced.length > 0 ? unreferenced : remaining;
    ordered.push(...next);
    remaining = remaining.filter((name) => !next.includes(name));
  }
  return ordered;
}

async function isInitializedAtVersion(
  sql: DemoSqlExecutor,
  version: string,
): Promise<boolean> {
  try {
    const rows = await sql.query(`SELECT version FROM ${READY_TABLE} LIMIT 1`);
    return rows[0]?.version === version;
  } catch {
    // A fresh DO, or a marker from before versioning: both are stale.
    return false;
  }
}

async function listUserObjects(
  sql: DemoSqlExecutor,
  type: "table" | "trigger",
): Promise<string[]> {
  // Exclude SQLite (`sqlite_%`), Cloudflare (`_cf_%`), and miniflare-in-dev
  // (`__miniflare_%`, matched by the `__*` GLOB) internal objects so cleanup
  // never drops them.
  const rows = await sql.query(
    `SELECT name FROM sqlite_master WHERE type = '${type}' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT GLOB '__*'`,
  );
  return rows
    .map((row) => String(row.name))
    .filter((name) => SAFE_IDENTIFIER.test(name));
}
