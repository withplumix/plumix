// Drizzle 0.45 ships no `node:sqlite` driver; 1.0's `drizzle-orm/node-sqlite`
// replaces this file. Drizzle's types collapse to `any` here, so this package's
// tests pin the contract.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type {
  SQLInputValue,
  SQLOutputValue,
  StatementResultingChanges,
  StatementSync,
} from "node:sqlite";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from "drizzle-orm";
import { BetterSQLiteSession } from "drizzle-orm/better-sqlite3/session";
import { BaseSQLiteDatabase, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { traceDbQuerySync } from "plumix/runtime";

const BUSY_TIMEOUT_MS = 5_000;

type BindValue = SQLInputValue | boolean | Date;

interface RawStatement {
  all(...params: BindValue[]): SQLOutputValue[][];
  get(...params: BindValue[]): SQLOutputValue[] | undefined;
}

interface NodeSqliteStatement {
  run(...params: BindValue[]): StatementResultingChanges;
  all(...params: BindValue[]): Record<string, SQLOutputValue>[];
  get(...params: BindValue[]): Record<string, SQLOutputValue> | undefined;
  raw(): RawStatement;
}

export interface NodeSqliteClient {
  prepare(sql: string): NodeSqliteStatement;
  close(): void;
}

export type NodeSqliteDatabase<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> = BaseSQLiteDatabase<"sync", StatementResultingChanges, TSchema>;

// `setReturnArrays(true)` is not reflected in `node:sqlite`'s signatures, so
// array-mode results are narrowed by hand.
const arrays = (rows: unknown): SQLOutputValue[][] =>
  rows as SQLOutputValue[][];

// Mirrors libsql's `valueToSql`.
const bind = (params: BindValue[]): SQLInputValue[] =>
  params.map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof Date) return value.valueOf();
    return value;
  });

// SQLite leaves `changes` at 0 for a `db.run` of a select, where libsql reports
// the row count.
const rowsReturned = (rows: readonly unknown[]): number => rows.length;
const rowOrNone = (row: unknown): number => (row === undefined ? 0 : 1);
const rowsChanged = (result: StatementResultingChanges): number =>
  Number(result.changes);

// `database.exec` stays untraced, as for every other adapter. Spans carry
// params as bound by the caller, not as `bind` coerced them.
function statement(stmt: StatementSync, sql: string): NodeSqliteStatement {
  // Array mode is sticky on the shared statement, so each read sets it, outside
  // the timed closure.
  const allRows = (asArrays: boolean) => (params: BindValue[]) => {
    stmt.setReturnArrays(asArrays);
    return traceDbQuerySync(
      { sql, params },
      () => stmt.all(...bind(params)),
      rowsReturned,
    );
  };
  const oneRow = (asArrays: boolean) => (params: BindValue[]) => {
    stmt.setReturnArrays(asArrays);
    return traceDbQuerySync(
      { sql, params },
      () => stmt.get(...bind(params)),
      rowOrNone,
    );
  };
  const objects = { all: allRows(false), get: oneRow(false) };
  const lists = { all: allRows(true), get: oneRow(true) };
  const rows: RawStatement = {
    all: (...params) => arrays(lists.all(params)),
    get: (...params) => arrays([lists.get(params)])[0],
  };
  return {
    run: (...params) =>
      traceDbQuerySync(
        { sql, params },
        () => stmt.run(...bind(params)),
        rowsChanged,
      ),
    all: (...params) => objects.all(params),
    get: (...params) => objects.get(params),
    raw: () => rows,
  };
}

// WAL so a reader never blocks the writer; `synchronous = NORMAL` is durable
// across a crash under WAL without an fsync per commit. Foreign keys are
// already on — `node:sqlite`'s default.
export function openNodeSqlite(path: string): NodeSqliteClient {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path, { timeout: BUSY_TIMEOUT_MS });
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  return {
    prepare: (sql) => statement(database.prepare(sql), sql),
    close: () => database.close(),
  };
}

export function drizzleNodeSqlite<TSchema extends Record<string, unknown>>(
  client: NodeSqliteClient,
  schema: TSchema,
): NodeSqliteDatabase<TSchema> {
  const dialect = new SQLiteSyncDialect({ casing: "snake_case" });
  const tables = extractTablesRelationalConfig<
    ExtractTablesWithRelations<TSchema>
  >(schema, createTableRelationsHelpers);
  const relational = {
    fullSchema: schema,
    schema: tables.tables,
    tableNamesMap: tables.tableNamesMap,
  };
  const session = new BetterSQLiteSession<
    TSchema,
    ExtractTablesWithRelations<TSchema>
  >(client, dialect, relational);
  return new BaseSQLiteDatabase<"sync", StatementResultingChanges, TSchema>(
    "sync",
    dialect,
    session,
    relational,
  );
}
