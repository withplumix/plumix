// Drizzle 0.45 ships no `node:sqlite` driver. Its 1.0 line does —
// `drizzle-orm/node-sqlite` — and replaces this file on that upgrade. Until
// then, a client shaped like better-sqlite3's carries `node:sqlite` into
// drizzle's public better-sqlite3 session: `prepare` and the four statement
// members the session calls, nothing more. No `transaction`: core never calls
// `db.transaction`, and the migrator runs raw BEGIN/COMMIT.
//
// Nothing here is checked against drizzle's types — its session imports them
// from `better-sqlite3`, which is not installed, so they collapse to `any`.
// The contract is pinned by this package's tests, which reach every branch
// of drizzle's prepared query. Column-mapped values arrive as 0/1 and
// numbers; a boolean or Date interpolated into a raw `sql` template arrives
// untouched, and `node:sqlite` binds neither: a boolean throws, and a
// leading Date is taken for the named-parameter object, so the positional
// values shift left and the last `?` binds NULL.
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

function statement(stmt: StatementSync): NodeSqliteStatement {
  const rows: RawStatement = {
    all: (...params) => {
      stmt.setReturnArrays(true);
      return arrays(stmt.all(...bind(params)));
    },
    get: (...params) => {
      stmt.setReturnArrays(true);
      return arrays([stmt.get(...bind(params))])[0];
    },
  };
  return {
    run: (...params) => stmt.run(...bind(params)),
    all: (...params) => {
      stmt.setReturnArrays(false);
      return stmt.all(...bind(params));
    },
    get: (...params) => {
      stmt.setReturnArrays(false);
      return stmt.get(...bind(params));
    },
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
    prepare: (sql) => statement(database.prepare(sql)),
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
