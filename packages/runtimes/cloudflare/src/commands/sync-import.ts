import { once } from "node:events";
import { createWriteStream } from "node:fs";
import type {
  DumpReader,
  SyncDependentReport,
  SyncImportReport,
  SyncRow,
  SyncScope,
  SyncScopeTable,
  SyncTableReport,
  SyncValue,
} from "plumix/cli";

import type { ForeignKey, SiteReader } from "./sync-reads.js";
import { CloudflareCliError } from "./errors.js";
import {
  chunks,
  foreignKeys,
  literalList,
  primaryKey,
  selectedRows,
  selection,
  siteTables,
  userColumns,
} from "./sync-reads.js";
import { ident, insertLine, rowLiterals, sqlLiteral } from "./sync-sql.js";

/** A script's first line; D1 holds the deferral to the transaction's end. */
export const DEFER_FOREIGN_KEYS = "PRAGMA defer_foreign_keys = ON;";

/** The auth state a `users` replace re-points rather than removes. */
const REPOINTED_AUTH_TABLES = ["sessions", "api_tokens"];

/** A target row kept across a `users` replace, with its user's email. */
interface AuthHolder {
  readonly table: string;
  readonly email: string;
  readonly row: SyncRow;
}

interface ScriptLines {
  write(line: string): Promise<void>;
  readonly count: number;
}

function scriptLines(path: string): ScriptLines & { end(): Promise<void> } {
  const stream = createWriteStream(path);
  let count = 0;
  return {
    get count() {
      return count;
    },
    async write(line) {
      count += 1;
      if (!stream.write(`${line}\n`)) await once(stream, "drain");
    },
    async end() {
      stream.end();
      await once(stream, "finish");
    },
  };
}

function rowKey(row: SyncRow, columns: readonly string[]): string {
  const values = columns.length > 0 ? columns.map((c) => row[c]) : [row];
  return JSON.stringify(values, (_key, value: unknown) =>
    value instanceof Uint8Array ? [...value] : value,
  );
}

async function existingKeys(
  db: SiteReader,
  table: SyncScopeTable,
  keyColumns: readonly string[],
): Promise<Set<string>> {
  const columns =
    keyColumns.length > 0 ? keyColumns.map(ident).join(", ") : "*";
  const keys = new Set<string>();
  for await (const row of selectedRows(db, table, columns)) {
    keys.add(rowKey(row, keyColumns));
  }
  return keys;
}

/**
 * The tables outside the sync that reference a replaced one, directly or
 * through another such table, with the keys that make them so.
 */
async function dependentTables(
  db: SiteReader,
  replaced: ReadonlySet<string>,
): Promise<Map<string, ForeignKey[]>> {
  const keysOf = new Map<string, ForeignKey[]>();
  for (const table of await siteTables(db)) {
    if (!replaced.has(table)) keysOf.set(table, await foreignKeys(db, table));
  }
  const dependents = new Map<string, ForeignKey[]>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [table, keys] of keysOf) {
      if (dependents.has(table)) continue;
      const referencing = keys.filter(
        (key) => replaced.has(key.parent) || dependents.has(key.parent),
      );
      if (referencing.length === 0) continue;
      dependents.set(table, referencing);
      grew = true;
    }
  }
  return dependents;
}

function clears(key: ForeignKey): boolean {
  return key.onDelete === "SET NULL" || key.onDelete === "SET DEFAULT";
}

function cascades(key: ForeignKey): boolean {
  return key.onDelete === "CASCADE" || clears(key);
}

/**
 * Which rows of each table the replace deletes, as SQL over that table, so
 * the dry run counts what the foreign keys will cascade to without writing.
 */
class Deletions {
  constructor(
    private readonly replaced: ReadonlyMap<string, SyncScopeTable>,
    private readonly dependents: ReadonlyMap<string, readonly ForeignKey[]>,
  ) {}

  private within(key: ForeignKey, visiting: ReadonlySet<string>): string {
    return `${ident(key.column)} IN (SELECT ${ident(key.parentColumn)} FROM ${ident(key.parent)} WHERE ${this.deleted(key.parent, visiting)})`;
  }

  /** A cycle back to a table being expanded adds no rows it has not. */
  deleted(table: string, visiting: ReadonlySet<string> = new Set()): string {
    const scoped = this.replaced.get(table);
    if (scoped !== undefined) return scoped.where ?? "1";
    const inner = new Set([...visiting, table]);
    const terms: string[] = [];
    for (const key of this.dependents.get(table) ?? []) {
      if (inner.has(key.parent)) continue;
      if (this.replaced.has(key.parent) && !cascades(key)) {
        terms.push(
          `${ident(key.column)} IN (SELECT ${ident(key.parentColumn)} FROM ${ident(key.parent)})`,
        );
      } else if (key.onDelete === "CASCADE") {
        terms.push(this.within(key, inner));
      }
    }
    return terms.length === 0 ? "0" : terms.map((t) => `(${t})`).join(" OR ");
  }

  /** Rows a key clears, among those no other key deletes. */
  cleared(table: string, key: ForeignKey): string {
    const inner = new Set([table]);
    return `NOT COALESCE(${this.deleted(table)}, 0) AND ${ident(key.column)} IS NOT NULL AND ${this.within(key, inner)}`;
  }

  clearingKeys(table: string): ForeignKey[] {
    return (this.dependents.get(table) ?? []).filter(
      (key) => clears(key) && key.parent !== table,
    );
  }
}

async function count(
  db: SiteReader,
  table: string,
  where: string,
): Promise<number> {
  const [row] = await db.all(
    `SELECT count(*) AS n FROM ${ident(table)} WHERE ${where}`,
  );
  return Number(row?.n ?? 0);
}

interface DependentCount {
  readonly table: string;
  readonly removed: number;
  readonly cleared: number;
}

async function dependentCounts(
  db: SiteReader,
  deletions: Deletions,
  dependents: ReadonlyMap<string, readonly ForeignKey[]>,
): Promise<DependentCount[]> {
  const counts: DependentCount[] = [];
  for (const table of [...dependents.keys()].sort()) {
    const removed = await count(
      db,
      table,
      `COALESCE(${deletions.deleted(table)}, 0)`,
    );
    let cleared = 0;
    for (const key of deletions.clearingKeys(table)) {
      cleared += await count(db, table, deletions.cleared(table, key));
    }
    counts.push({ table, removed, cleared });
  }
  return counts;
}

/** Statements that empty what the scopes select, children first. */
async function deleteStatements(
  lines: ScriptLines,
  tables: readonly SyncScopeTable[],
  replaced: ReadonlySet<string>,
  dependents: ReadonlyMap<string, readonly ForeignKey[]>,
): Promise<void> {
  // A key that neither cascades nor clears would refuse the replace, so the
  // rows it holds go first, like the ones a cascade removes.
  for (const [table, keys] of dependents) {
    for (const key of keys) {
      if (cascades(key) || !replaced.has(key.parent)) continue;
      await lines.write(
        `DELETE FROM ${ident(table)} WHERE ${ident(key.column)} IN (SELECT ${ident(key.parentColumn)} FROM ${ident(key.parent)});`,
      );
    }
  }
  for (const table of [...tables].reverse()) {
    await lines.write(`DELETE ${selection(table)};`);
  }
}

async function authHolders(db: SiteReader): Promise<AuthHolder[]> {
  const holders: AuthHolder[] = [];
  for (const table of REPOINTED_AUTH_TABLES) {
    const rows = await db.all(
      `SELECT t.*, u.email AS "$email" FROM ${ident(table)} t JOIN users u ON u.id = t.user_id`,
    );
    for (const { $email, ...row } of rows) {
      holders.push({ table, email: String($email), row });
    }
  }
  return holders;
}

function userIdByEmail(email: string): string {
  return `(SELECT id FROM users WHERE email = ${sqlLiteral(email)})`;
}

/** The SQL a user column takes, and the value its row's key is made from. */
interface AuthorRef {
  readonly sql: string;
  readonly key: SyncValue;
}

/** Each of the dump's authors, as the target will know them. */
type Authors = ReadonlyMap<number, AuthorRef>;

async function userIdsByEmail(
  db: SiteReader,
  emails: readonly string[],
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const group of chunks([...new Set(emails)])) {
    const rows = await db.all(
      `SELECT id, email FROM users WHERE email IN (${literalList(group)})`,
    );
    for (const row of rows) ids.set(String(row.email), Number(row.id));
  }
  return ids;
}

async function freeSlug(
  db: SiteReader,
  base: string,
  claimed: Set<string>,
): Promise<string> {
  const rows = await db.all(
    `SELECT slug FROM users WHERE slug = ${sqlLiteral(base)} OR substr(slug, 1, ${String(base.length + 1)}) = ${sqlLiteral(`${base}-`)}`,
  );
  const taken = new Set([...claimed, ...rows.map((row) => String(row.slug))]);
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) {
    slug = `${base}-${String(suffix)}`;
  }
  claimed.add(slug);
  return slug;
}

/**
 * Matches each author by email, and writes the ones the target lacks as
 * disabled users, which the rows then find by email.
 */
async function resolveAuthors(
  db: SiteReader,
  from: DumpReader,
  lines: ScriptLines,
  now: Date,
): Promise<{ readonly authors: Authors; readonly added: string[] }> {
  const dumped: SyncRow[] = [];
  for await (const author of from.authors()) dumped.push(author);
  const existing = await userIdsByEmail(
    db,
    dumped.map((author) => String(author.email)),
  );
  const authors = new Map<number, AuthorRef>();
  const added: string[] = [];
  const claimed = new Set<string>();
  for (const author of dumped) {
    const email = String(author.email);
    const found = existing.get(email);
    if (found !== undefined) {
      authors.set(Number(author.id), { sql: String(found), key: found });
      continue;
    }
    await lines.write(
      insertLine("users", {
        email: sqlLiteral(email),
        slug: sqlLiteral(await freeSlug(db, String(author.slug), claimed)),
        name: sqlLiteral(author.name ?? null),
        avatar_url: sqlLiteral(author.avatar_url ?? null),
        role: sqlLiteral(author.role ?? "subscriber"),
        meta: sqlLiteral("{}"),
        disabled_at: String(Math.floor(now.getTime() / 1000)),
      }),
    );
    const ref = userIdByEmail(email);
    authors.set(Number(author.id), { sql: ref, key: ref });
    added.push(email);
  }
  return { authors, added };
}

interface TableInsert {
  readonly table: SyncScopeTable;
  readonly existing: ReadonlySet<string>;
  readonly keyColumns: readonly string[];
  /** Columns rewritten to the target's users; none when `users` travels. */
  readonly userColumns: readonly string[];
  /** Keys into the table itself, whose parent row must be written first. */
  readonly selfKeys: readonly ForeignKey[];
}

function valueKey(column: string, value: SyncValue): string {
  return rowKey({ [column]: value }, [column]);
}

/**
 * Holds a row back until its parent in the same table is written: a local
 * import commits in several calls, and a foreign key holds at each commit.
 */
class ParentsFirst {
  private readonly written = new Set<string>();
  private readonly waiting = new Map<string, SyncRow[]>();

  constructor(private readonly keys: readonly ForeignKey[]) {}

  private missingParent(row: SyncRow): string | undefined {
    for (const key of this.keys) {
      const value = row[key.column];
      if (value === null || value === undefined) continue;
      if (row[key.parentColumn] === value) continue;
      const parent = valueKey(key.parentColumn, value);
      if (!this.written.has(parent)) return parent;
    }
    return undefined;
  }

  /** The rows to write now, in order: this one and any it unblocks. */
  arrive(row: SyncRow): SyncRow[] {
    if (this.keys.length === 0) return [row];
    const ready: SyncRow[] = [];
    const queue = [row];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const parent = this.missingParent(next);
      if (parent !== undefined) {
        this.waiting.set(parent, [...(this.waiting.get(parent) ?? []), next]);
        continue;
      }
      ready.push(next);
      for (const key of this.keys) {
        const value = next[key.parentColumn];
        if (value === null || value === undefined) continue;
        const written = valueKey(key.parentColumn, value);
        this.written.add(written);
        queue.push(...(this.waiting.get(written) ?? []));
        this.waiting.delete(written);
      }
    }
    return ready;
  }

  /** Rows whose parent never arrived, as the dump ordered them. */
  rest(): SyncRow[] {
    return [...this.waiting.values()].flat();
  }
}

async function insertTable(
  lines: ScriptLines,
  from: DumpReader,
  insert: TableInsert,
  authors: Authors,
  onRow: (row: SyncRow) => void,
): Promise<SyncTableReport> {
  const { table, existing, keyColumns } = insert;
  const matched = new Set<string>();
  let replaced = 0;
  let added = 0;
  const write = async (dumped: SyncRow): Promise<void> => {
    const literals = rowLiterals(dumped);
    const keyed: Record<string, SyncValue> = { ...dumped };
    for (const column of insert.userColumns) {
      const value = dumped[column];
      if (value === null || value === undefined) continue;
      const author = authors.get(Number(value));
      if (author === undefined) {
        throw CloudflareCliError.syncAuthorMissing({
          table: table.table,
          column,
          user: String(value),
        });
      }
      literals[column] = author.sql;
      keyed[column] = author.key;
    }
    await lines.write(insertLine(table.table, literals));
    onRow(dumped);
    const key = rowKey(keyed, keyColumns);
    if (existing.has(key)) {
      matched.add(key);
      replaced += 1;
    } else {
      added += 1;
    }
  };
  const order = new ParentsFirst(insert.selfKeys);
  for await (const dumped of from.rows(table.table)) {
    for (const row of order.arrive(dumped)) await write(row);
  }
  for (const row of order.rest()) await write(row);
  return {
    table: table.table,
    replaced,
    added,
    removed: existing.size - matched.size,
  };
}

async function repointAuthHolders(
  lines: ScriptLines,
  holders: readonly AuthHolder[],
  emails: ReadonlySet<string>,
): Promise<Map<string, number>> {
  const repointed = new Map<string, number>();
  for (const holder of holders) {
    if (!emails.has(holder.email)) continue;
    await lines.write(
      insertLine(holder.table, {
        ...rowLiterals(holder.row),
        user_id: userIdByEmail(holder.email),
      }),
    );
    repointed.set(holder.table, (repointed.get(holder.table) ?? 0) + 1);
  }
  return repointed;
}

function dependentReports(
  counts: readonly DependentCount[],
  repointed: ReadonlyMap<string, number>,
): SyncDependentReport[] {
  return counts
    .map((counted) => ({
      ...counted,
      removed: counted.removed - (repointed.get(counted.table) ?? 0),
    }))
    .filter((counted) => counted.removed !== 0 || counted.cleared !== 0);
}

export interface ImportScript {
  readonly report: SyncImportReport;
  /** Statements beyond the opening pragma; none when nothing is replaced. */
  readonly statements: number;
}

export interface ImportScriptOptions {
  readonly now: Date;
  /** Called once per table, after its rows are written. */
  readonly onTable?: (table: SyncTableReport) => void;
}

/**
 * Writes the replace of what the scopes select as one statement per line to
 * `path`, and reports what it does, reading the target but never writing it.
 */
export async function writeImportScript(
  db: SiteReader,
  from: DumpReader,
  scopes: readonly SyncScope[],
  path: string,
  options: ImportScriptOptions,
): Promise<ImportScript> {
  const tables = scopes.flatMap((scope) => scope.tables);
  const replaced = new Set(tables.map((table) => table.table));
  const dependents = await dependentTables(db, replaced);
  const deletions = new Deletions(
    new Map(tables.map((table) => [table.table, table])),
    dependents,
  );
  const counts = await dependentCounts(db, deletions, dependents);
  const travelsWithUsers = replaced.has("users");
  const inserts: TableInsert[] = [];
  for (const table of tables) {
    const keyColumns = await primaryKey(db, table.table);
    inserts.push({
      table,
      keyColumns,
      selfKeys: (await foreignKeys(db, table.table)).filter(
        (key) => key.parent === table.table,
      ),
      existing: await existingKeys(db, table, keyColumns),
      userColumns: travelsWithUsers ? [] : await userColumns(db, table.table),
    });
  }
  const holders = travelsWithUsers ? await authHolders(db) : [];

  const lines = scriptLines(path);
  try {
    await lines.write(DEFER_FOREIGN_KEYS);
    await deleteStatements(lines, tables, replaced, dependents);
    const { authors, added } = travelsWithUsers
      ? { authors: new Map<number, AuthorRef>(), added: [] }
      : await resolveAuthors(db, from, lines, options.now);
    const emails = new Set<string>();
    const reports: SyncTableReport[] = [];
    for (const insert of inserts) {
      const report = await insertTable(lines, from, insert, authors, (row) => {
        if (insert.table.table === "users") emails.add(String(row.email));
      });
      options.onTable?.(report);
      reports.push(report);
    }
    const repointed = await repointAuthHolders(lines, holders, emails);
    return {
      report: {
        tables: reports,
        dependents: dependentReports(counts, repointed),
        authorsAdded: added,
      },
      statements: tables.length === 0 ? 0 : lines.count - 1,
    };
  } finally {
    await lines.end();
  }
}
