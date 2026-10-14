import type { Client, InValue, Transaction } from "@libsql/client";

import type { AppContext } from "../../context/app-context.js";
import type {
  DumpReader,
  OpenSyncEndOptions,
  RuntimeSync,
  SyncDependentReport,
  SyncEnd,
  SyncImportReport,
  SyncRow,
  SyncScope,
  SyncScopeTable,
  SyncTableReport,
  SyncValue,
} from "../../context/runtime-adapter.js";
import type { ConnectedObjectStorage } from "../../runtime/contract/slots.js";
import { assertSameHeads, readSyncHeads } from "../../cli/sync.js";
import { settleSync } from "../../context/settle-sync.js";
import { resolveEnvInput } from "../../runtime/contract/env-input.js";

/** One end of {@link memorySync}. */
export interface MemorySyncSite {
  /** A migrated database; an in-memory one holds a single connection. */
  readonly client: Client;
  /** Where `media` reads and writes objects. */
  readonly storage?: ConnectedObjectStorage;
  /** What `settle` runs `settleSync` against; without it `settle` throws. */
  readonly ctx?: AppContext;
}

export interface MemorySyncSites {
  readonly local: MemorySyncSite;
  readonly remote: MemorySyncSite;
}

/** `execute` is all a read or write needs, inside a transaction or not. */
type Executor = Pick<Transaction, "execute">;

interface ForeignKey {
  readonly parent: string;
  readonly column: string;
  readonly parentColumn: string | null;
  readonly onDelete: string;
}

/** A target row kept across a `users` replace, with its user's email. */
interface AuthHolder {
  readonly table: string;
  readonly email: string;
  readonly row: SyncRow;
}

/** The auth state a `users` replace re-points rather than removes. */
const REPOINTED_AUTH_TABLES = ["sessions", "api_tokens"];

/** Below SQLite's bound-parameter limit on every build. */
const PARAMS_PER_STATEMENT = 500;

const AUTHOR_COLUMNS = "id, email, slug, name, avatar_url, role";

function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function syncValue(value: unknown): SyncValue {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "bigint") return Number(value);
  return value as SyncValue;
}

async function rowsOf(
  executor: Executor,
  sql: string,
  args: readonly InValue[] = [],
): Promise<SyncRow[]> {
  const result = await executor.execute({ sql, args: [...args] });
  return result.rows.map((row): SyncRow =>
    Object.fromEntries(
      result.columns.map((column) => [column, syncValue(row[column])]),
    ),
  );
}

function chunks<T>(items: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += PARAMS_PER_STATEMENT) {
    groups.push(items.slice(start, start + PARAMS_PER_STATEMENT));
  }
  return groups;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function* iterate<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

function scopeTables(scopes: readonly SyncScope[]): SyncScopeTable[] {
  return scopes.flatMap((scope) => scope.tables);
}

function selection(table: SyncScopeTable): string {
  const where = table.where === undefined ? "" : ` WHERE ${table.where}`;
  return `FROM ${ident(table.table)}${where}`;
}

async function primaryKey(
  executor: Executor,
  table: string,
): Promise<string[]> {
  const rows = await rowsOf(
    executor,
    "SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk",
    [table],
  );
  return rows.map((row) => String(row.name));
}

async function foreignKeys(
  executor: Executor,
  table: string,
): Promise<ForeignKey[]> {
  const rows = await rowsOf(
    executor,
    `SELECT "table" AS parent, "from" AS col, "to" AS parent_col, on_delete FROM pragma_foreign_key_list(?)`,
    [table],
  );
  return rows.map((row) => ({
    parent: String(row.parent),
    column: String(row.col),
    parentColumn: row.parent_col === null ? null : String(row.parent_col),
    onDelete: String(row.on_delete).toUpperCase(),
  }));
}

async function siteTables(executor: Executor): Promise<string[]> {
  const rows = await rowsOf(
    executor,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name",
  );
  return rows.map((row) => String(row.name));
}

async function userColumns(
  executor: Executor,
  table: string,
): Promise<string[]> {
  return (await foreignKeys(executor, table))
    .filter((key) => key.parent === "users")
    .map((key) => key.column);
}

async function authorsOf(
  executor: Executor,
  tables: readonly SyncScopeTable[],
): Promise<SyncRow[]> {
  const ids = new Set<number>();
  for (const table of tables) {
    for (const column of await userColumns(executor, table.table)) {
      const where = table.where === undefined ? "" : ` AND (${table.where})`;
      const rows = await rowsOf(
        executor,
        `SELECT DISTINCT ${ident(column)} AS id FROM ${ident(table.table)} WHERE ${ident(column)} IS NOT NULL${where}`,
      );
      for (const row of rows) ids.add(Number(row.id));
    }
  }
  const authors: SyncRow[] = [];
  for (const group of chunks([...ids])) {
    authors.push(
      ...(await rowsOf(
        executor,
        `SELECT ${AUTHOR_COLUMNS} FROM users WHERE id IN (${placeholders(group.length)})`,
        group,
      )),
    );
  }
  return authors.sort((a, b) => Number(a.id) - Number(b.id));
}

async function* storedObjects(storage: ConnectedObjectStorage): AsyncIterable<{
  key: string;
  contentType?: string;
  body: ReadableStream<Uint8Array>;
}> {
  let cursor: string | undefined;
  do {
    const page = await storage.list(undefined, cursor ? { cursor } : {});
    for (const item of page.items) {
      const found = await storage.get(item.key);
      if (found === null) continue;
      yield {
        key: item.key,
        body: found.body,
        ...(found.contentType && { contentType: found.contentType }),
      };
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
}

async function storedKeys(storage: ConnectedObjectStorage): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await storage.list(undefined, cursor ? { cursor } : {});
    keys.push(...page.items.map((item) => item.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return keys;
}

function rowKey(row: SyncRow, columns: readonly string[]): string {
  const values = columns.length > 0 ? columns.map((c) => row[c]) : [row];
  return JSON.stringify(values, (_key, value: unknown) =>
    value instanceof Uint8Array ? [...value] : value,
  );
}

async function existingKeys(
  executor: Executor,
  table: SyncScopeTable,
  columns: readonly string[],
): Promise<Set<string>> {
  const rows = await rowsOf(executor, `SELECT * ${selection(table)}`);
  return new Set(rows.map((row) => rowKey(row, columns)));
}

async function insertRow(
  executor: Executor,
  table: string,
  row: SyncRow,
): Promise<void> {
  const columns = Object.keys(row);
  await executor.execute({
    sql: `INSERT INTO ${ident(table)} (${columns.map(ident).join(", ")}) VALUES (${placeholders(columns.length)})`,
    args: columns.map((column) => row[column] ?? null),
  });
}

/**
 * The tables outside the sync that reference a replaced one, directly or
 * through another such table, with the keys that make them so.
 */
async function dependentTables(
  executor: Executor,
  replaced: ReadonlySet<string>,
): Promise<Map<string, ForeignKey[]>> {
  const keysOf = new Map<string, ForeignKey[]>();
  for (const table of await siteTables(executor)) {
    if (!replaced.has(table)) {
      keysOf.set(table, await foreignKeys(executor, table));
    }
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

interface DependentState {
  readonly rows: number;
  /** Rowids of rows whose clearing key held a value, per key column. */
  readonly referencing: ReadonlyMap<string, readonly number[]>;
}

async function countRows(executor: Executor, table: string): Promise<number> {
  const [row] = await rowsOf(
    executor,
    `SELECT count(*) AS n FROM ${ident(table)}`,
  );
  return Number(row?.n ?? 0);
}

async function dependentStates(
  executor: Executor,
  dependents: ReadonlyMap<string, readonly ForeignKey[]>,
): Promise<Map<string, DependentState>> {
  const states = new Map<string, DependentState>();
  for (const [table, keys] of dependents) {
    const referencing = new Map<string, number[]>();
    for (const key of keys.filter(clears)) {
      const rows = await rowsOf(
        executor,
        `SELECT rowid AS id FROM ${ident(table)} WHERE ${ident(key.column)} IS NOT NULL`,
      );
      referencing.set(
        key.column,
        rows.map((row) => Number(row.id)),
      );
    }
    states.set(table, { rows: await countRows(executor, table), referencing });
  }
  return states;
}

async function clearedSince(
  executor: Executor,
  table: string,
  state: DependentState,
): Promise<number> {
  let cleared = 0;
  for (const [column, ids] of state.referencing) {
    for (const group of chunks(ids)) {
      const [row] = await rowsOf(
        executor,
        `SELECT count(*) AS n FROM ${ident(table)} WHERE ${ident(column)} IS NULL AND rowid IN (${placeholders(group.length)})`,
        group,
      );
      cleared += Number(row?.n ?? 0);
    }
  }
  return cleared;
}

async function dependentReports(
  executor: Executor,
  before: ReadonlyMap<string, DependentState>,
): Promise<SyncDependentReport[]> {
  const reports: SyncDependentReport[] = [];
  for (const [table, state] of [...before].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const removed = state.rows - (await countRows(executor, table));
    const cleared = await clearedSince(executor, table, state);
    if (removed === 0 && cleared === 0) continue;
    reports.push({ table, removed, cleared });
  }
  return reports;
}

/**
 * A key that neither cascades nor clears would refuse the replace, so the rows
 * it holds are removed first, like the ones a cascade removes.
 */
async function removeRefusingRows(
  executor: Executor,
  dependents: ReadonlyMap<string, readonly ForeignKey[]>,
  replaced: ReadonlySet<string>,
): Promise<void> {
  for (const [table, keys] of dependents) {
    for (const key of keys) {
      if (cascades(key) || !replaced.has(key.parent)) continue;
      const parentColumn =
        key.parentColumn ?? (await primaryKey(executor, key.parent))[0];
      if (parentColumn === undefined) continue;
      await executor.execute(
        `DELETE FROM ${ident(table)} WHERE ${ident(key.column)} IN (SELECT ${ident(parentColumn)} FROM ${ident(key.parent)})`,
      );
    }
  }
}

async function authHolders(executor: Executor): Promise<AuthHolder[]> {
  const holders: AuthHolder[] = [];
  for (const table of REPOINTED_AUTH_TABLES) {
    const rows = await rowsOf(
      executor,
      `SELECT t.*, u.email AS "$email" FROM ${ident(table)} t JOIN users u ON u.id = t.user_id`,
    );
    for (const { $email, ...row } of rows) {
      holders.push({ table, email: String($email), row });
    }
  }
  return holders;
}

async function userIdsByEmail(
  executor: Executor,
  emails: readonly string[],
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const group of chunks([...new Set(emails)])) {
    const rows = await rowsOf(
      executor,
      `SELECT id, email FROM users WHERE email IN (${placeholders(group.length)})`,
      group,
    );
    for (const row of rows) ids.set(String(row.email), Number(row.id));
  }
  return ids;
}

async function repointAuthHolders(
  executor: Executor,
  holders: readonly AuthHolder[],
): Promise<void> {
  const ids = await userIdsByEmail(
    executor,
    holders.map((holder) => holder.email),
  );
  for (const holder of holders) {
    const userId = ids.get(holder.email);
    if (userId === undefined) continue;
    await insertRow(executor, holder.table, { ...holder.row, user_id: userId });
  }
}

async function freeSlug(executor: Executor, base: string): Promise<string> {
  const rows = await rowsOf(
    executor,
    "SELECT slug FROM users WHERE slug = ? OR substr(slug, 1, ?) = ?",
    [base, base.length + 1, `${base}-`],
  );
  const taken = new Set(rows.map((row) => String(row.slug)));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${String(suffix)}`)) suffix += 1;
  return `${base}-${String(suffix)}`;
}

interface Authors {
  /** The dump's user id to the target's. */
  readonly ids: ReadonlyMap<number, number>;
  readonly added: readonly string[];
}

/** Matches each author by email, adding the ones the target lacks, disabled. */
async function resolveAuthors(
  executor: Executor,
  from: DumpReader,
  now: Date,
): Promise<Authors> {
  const authors = await collect(from.authors());
  const existing = await userIdsByEmail(
    executor,
    authors.map((author) => String(author.email)),
  );
  const ids = new Map<number, number>();
  const added: string[] = [];
  for (const author of authors) {
    const email = String(author.email);
    const found = existing.get(email);
    if (found !== undefined) {
      ids.set(Number(author.id), found);
      continue;
    }
    const [inserted] = await rowsOf(
      executor,
      "INSERT INTO users (email, slug, name, avatar_url, role, meta, disabled_at) VALUES (?, ?, ?, ?, ?, '{}', ?) RETURNING id",
      [
        email,
        await freeSlug(executor, String(author.slug)),
        author.name ?? null,
        author.avatar_url ?? null,
        author.role ?? "subscriber",
        Math.floor(now.getTime() / 1000),
      ],
    );
    ids.set(Number(author.id), Number(inserted?.id));
    added.push(email);
  }
  return { ids, added };
}

function withAuthors(
  table: string,
  row: SyncRow,
  columns: readonly string[],
  authors: Authors,
): SyncRow {
  const mapped: Record<string, SyncValue> = { ...row };
  for (const column of columns) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    const id = authors.ids.get(Number(value));
    if (id === undefined) {
      throw new Error(
        `memorySync: ${table}.${column} references user ${String(value)}, who is not among the dump's authors`,
      );
    }
    mapped[column] = id;
  }
  return mapped;
}

async function insertTable(
  executor: Executor,
  table: SyncScopeTable,
  from: DumpReader,
  existing: ReadonlySet<string>,
  authors: Authors | null,
): Promise<SyncTableReport> {
  const keyColumns = await primaryKey(executor, table.table);
  const remapped =
    authors === null ? [] : await userColumns(executor, table.table);
  const seen = new Set<string>();
  let replaced = 0;
  let added = 0;
  for await (const dumped of from.rows(table.table)) {
    const row =
      authors === null
        ? dumped
        : withAuthors(table.table, dumped, remapped, authors);
    await insertRow(executor, table.table, row);
    const key = rowKey(row, keyColumns);
    seen.add(key);
    if (existing.has(key)) replaced += 1;
    else added += 1;
  }
  const removed = [...existing].filter((key) => !seen.has(key)).length;
  return { table: table.table, replaced, added, removed };
}

async function replaceTables(
  executor: Executor,
  from: DumpReader,
  scopes: readonly SyncScope[],
  now: Date,
): Promise<SyncImportReport> {
  await executor.execute("PRAGMA defer_foreign_keys = ON");
  const tables = scopeTables(scopes);
  const replaced = new Set(tables.map((table) => table.table));
  const dependents = await dependentTables(executor, replaced);
  const before = await dependentStates(executor, dependents);
  const existing = new Map<string, Set<string>>();
  for (const table of tables) {
    const keyColumns = await primaryKey(executor, table.table);
    existing.set(table.table, await existingKeys(executor, table, keyColumns));
  }
  const holders = replaced.has("users") ? await authHolders(executor) : [];

  await removeRefusingRows(executor, dependents, replaced);
  for (const table of [...tables].reverse()) {
    await executor.execute(`DELETE ${selection(table)}`);
  }
  const authors = replaced.has("users")
    ? null
    : await resolveAuthors(executor, from, now);
  const reports: SyncTableReport[] = [];
  for (const table of tables) {
    reports.push(
      await insertTable(
        executor,
        table,
        from,
        existing.get(table.table) ?? new Set(),
        authors,
      ),
    );
  }
  await repointAuthHolders(executor, holders);

  return {
    tables: reports,
    dependents: await dependentReports(executor, before),
    authorsAdded: authors?.added ?? [],
  };
}

interface StoredCopy {
  readonly key: string;
  readonly bytes: ArrayBuffer;
  readonly contentType?: string;
}

/** Puts every object back as it was, and removes any the import added. */
type RestoreObjects = () => Promise<void>;

async function copyObjects(
  storage: ConnectedObjectStorage,
): Promise<StoredCopy[]> {
  const copies: StoredCopy[] = [];
  for (const key of await storedKeys(storage)) {
    const found = await storage.get(key);
    if (found === null) continue;
    copies.push({
      key,
      bytes: await found.arrayBuffer(),
      ...(found.contentType && { contentType: found.contentType }),
    });
  }
  return copies;
}

async function restoreObjects(
  storage: ConnectedObjectStorage,
  copies: readonly StoredCopy[],
): Promise<void> {
  const kept = new Set(copies.map((copy) => copy.key));
  for (const key of await storedKeys(storage)) {
    if (!kept.has(key)) await storage.delete(key);
  }
  for (const copy of copies) {
    await storage.put(copy.key, copy.bytes, {
      ...(copy.contentType && { contentType: copy.contentType }),
    });
  }
}

/**
 * Copies the bucket first, so a write that fails, or a database commit after
 * it, restores the objects and the import stays all-or-nothing.
 */
async function replaceObjects(
  storage: ConnectedObjectStorage,
  from: DumpReader,
): Promise<RestoreObjects> {
  const copies = await copyObjects(storage);
  const restore = (): Promise<void> => restoreObjects(storage, copies);
  try {
    const stale = new Set(copies.map((copy) => copy.key));
    for await (const object of from.objects()) {
      await storage.put(object.key, object.body, {
        ...(object.contentType && { contentType: object.contentType }),
      });
      stale.delete(object.key);
    }
    for (const key of stale) await storage.delete(key);
  } catch (error) {
    await restore();
    throw error;
  }
  return restore;
}

function requireStorage(site: MemorySyncSite): ConnectedObjectStorage {
  if (site.storage === undefined) {
    throw new Error("memorySync: the media scope needs the site's storage");
  }
  return site.storage;
}

function originOf(options: OpenSyncEndOptions): string {
  if (options.target === "local") {
    return resolveEnvInput(options.config.auth.passkey.origin, {});
  }
  if (options.url === undefined) {
    throw new Error("memorySync: a remote end needs `url`");
  }
  return options.url;
}

function openEnd(site: MemorySyncSite, options: OpenSyncEndOptions): SyncEnd {
  const { client } = site;
  const heads = (): Promise<Record<string, string | null>> =>
    readSyncHeads(
      async (sql) => (await client.execute(sql)).rows,
      options.owners,
    );
  return {
    origin: originOf(options),
    heads,
    async exportData(scopes, into) {
      const tables = scopeTables(scopes);
      for (const table of tables) {
        const rows = await rowsOf(
          client,
          `SELECT * ${selection(table)} ORDER BY rowid`,
        );
        await into.table(table.table, iterate(rows));
      }
      if (!tables.some((table) => table.table === "users")) {
        await into.authors(iterate(await authorsOf(client, tables)));
      }
      if (!scopes.some((scope) => scope.name === "media")) return;
      for await (const object of storedObjects(requireStorage(site))) {
        await into.object(object.key, object.body, object.contentType);
      }
    },
    async importData(from, scopes, { dryRun }) {
      assertSameHeads(
        { label: "the dump", heads: from.manifest.heads },
        { label: options.target, heads: await heads() },
      );
      const media = scopes.some((scope) => scope.name === "media");
      const storage = media ? requireStorage(site) : undefined;
      const transaction = await client.transaction("write");
      let report: SyncImportReport;
      try {
        report = await replaceTables(transaction, from, scopes, new Date());
        if (dryRun) {
          await transaction.rollback();
          return report;
        }
        const restore =
          storage === undefined
            ? undefined
            : await replaceObjects(storage, from);
        try {
          await transaction.commit();
        } catch (error) {
          await restore?.();
          throw error;
        }
      } finally {
        transaction.close();
      }
      return report;
    },
    snapshot: () => Promise.resolve({ id: `memory:${options.target}` }),
    restoreHint: () =>
      "This in-memory end takes no snapshot: its import is one transaction, so a failed one changes nothing.",
    settle(event) {
      if (site.ctx === undefined) {
        return Promise.reject(
          new Error(`memorySync: the ${options.target} site was given no ctx`),
        );
      }
      return settleSync(site.ctx, event);
    },
    close: () => Promise.resolve(),
  };
}

/**
 * The reference transport: two libsql databases, each with optional object
 * storage and an app context to settle in. Its import is all-or-nothing.
 */
export function memorySync(sites: MemorySyncSites): RuntimeSync {
  return {
    open: (options) =>
      Promise.resolve(
        openEnd(
          options.target === "local" ? sites.local : sites.remote,
          options,
        ),
      ),
  };
}
