import type { SyncRow, SyncScopeTable, SyncValue } from "plumix/cli";

import { ident, sqlLiteral } from "./sync-sql.js";

/**
 * A database a sync reads with SQL it writes itself, its values inlined as
 * literals: D1 caps a statement at 100 bound parameters.
 */
export interface SiteReader {
  all(sql: string): Promise<SyncRow[]>;
}

/** Through a platform proxy a BLOB arrives as an array of its bytes. */
function syncValue(value: unknown): SyncValue {
  if (Array.isArray(value)) return new Uint8Array(value as number[]);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value as SyncValue;
}

export function d1Reader(db: D1Database): SiteReader {
  return {
    async all(sql) {
      const { results } = await db.prepare(sql).all();
      return results.map((row): SyncRow =>
        Object.fromEntries(
          Object.entries(row).map(([column, value]) => [
            column,
            syncValue(value),
          ]),
        ),
      );
    },
  };
}

/** Large enough to cross a remote connection in few round trips. */
const PAGE_ROWS = 10_000;

/** Keeps an `IN (…)` list of literals far below D1's statement size. */
const LITERALS_PER_LIST = 500;

export function chunks<T>(items: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += LITERALS_PER_LIST) {
    groups.push(items.slice(start, start + LITERALS_PER_LIST));
  }
  return groups;
}

export function literalList(values: readonly SyncValue[]): string {
  return values.map(sqlLiteral).join(", ");
}

export function selection(table: SyncScopeTable): string {
  const where = table.where === undefined ? "" : ` WHERE ${table.where}`;
  return `FROM ${ident(table.table)}${where}`;
}

const ROWID = "$rowid";

/**
 * The rows a table selects, a page at a time in rowid order, so no read has
 * to hold the whole table.
 */
export async function* selectedRows(
  db: SiteReader,
  table: SyncScopeTable,
  columns = "*",
): AsyncIterable<SyncRow> {
  const where = table.where === undefined ? "" : `(${table.where}) AND `;
  let after = 0;
  for (;;) {
    const page = await db.all(
      `SELECT rowid AS ${ident(ROWID)}, ${columns} FROM ${ident(table.table)} WHERE ${where}rowid > ${String(after)} ORDER BY rowid LIMIT ${String(PAGE_ROWS)}`,
    );
    for (const { [ROWID]: rowid, ...row } of page) {
      after = Number(rowid);
      yield row;
    }
    if (page.length < PAGE_ROWS) return;
  }
}

export interface ForeignKey {
  readonly parent: string;
  readonly column: string;
  /** The referenced column, or the parent's primary key when none is named. */
  readonly parentColumn: string;
  readonly onDelete: string;
}

/** Every table but SQLite's and D1's own. */
export async function siteTables(db: SiteReader): Promise<string[]> {
  const rows = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name",
  );
  return rows.map((row) => String(row.name));
}

export async function primaryKey(
  db: SiteReader,
  table: string,
): Promise<string[]> {
  const columns = await db.all(`PRAGMA table_info(${ident(table)})`);
  return columns
    .filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((column) => String(column.name));
}

export async function foreignKeys(
  db: SiteReader,
  table: string,
): Promise<ForeignKey[]> {
  const rows = await db.all(`PRAGMA foreign_key_list(${ident(table)})`);
  const keys: ForeignKey[] = [];
  for (const row of rows) {
    const parent = String(row.table);
    const parentColumn =
      row.to === null ? (await primaryKey(db, parent))[0] : String(row.to);
    if (parentColumn === undefined) continue;
    keys.push({
      parent,
      column: String(row.from),
      parentColumn,
      onDelete: String(row.on_delete).toUpperCase(),
    });
  }
  return keys;
}

export async function userColumns(
  db: SiteReader,
  table: string,
): Promise<string[]> {
  return (await foreignKeys(db, table))
    .filter((key) => key.parent === "users")
    .map((key) => key.column);
}

const AUTHOR_COLUMNS = "id, email, slug, name, avatar_url, role";

/** The users the tables' rows reference, by id. */
export async function authorsOf(
  db: SiteReader,
  tables: readonly SyncScopeTable[],
): Promise<SyncRow[]> {
  const ids = new Set<number>();
  for (const table of tables) {
    for (const column of await userColumns(db, table.table)) {
      const where = table.where === undefined ? "" : ` AND (${table.where})`;
      const rows = await db.all(
        `SELECT DISTINCT ${ident(column)} AS id FROM ${ident(table.table)} WHERE ${ident(column)} IS NOT NULL${where}`,
      );
      for (const row of rows) ids.add(Number(row.id));
    }
  }
  const authors: SyncRow[] = [];
  for (const group of chunks([...ids])) {
    authors.push(
      ...(await db.all(
        `SELECT ${AUTHOR_COLUMNS} FROM users WHERE id IN (${literalList(group)})`,
      )),
    );
  }
  return authors.sort((a, b) => Number(a.id) - Number(b.id));
}
