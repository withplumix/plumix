import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type * as BunSqlite from "bun:sqlite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from "drizzle-orm";
import { SQLiteBunSession } from "drizzle-orm/bun-sqlite/session";
import { BaseSQLiteDatabase, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { traceDbQuerySync } from "plumix/runtime";

const BUSY_TIMEOUT_MS = 5_000;

type BindValue = BunSqlite.SQLQueryBindings | Date;
type Row = ReturnType<BunSqlite.Statement["values"]>[number];

interface BunSqliteStatement {
  run(...params: BindValue[]): BunSqlite.Changes;
  all(...params: BindValue[]): unknown[];
  values(...params: BindValue[]): Row[];
}

export interface BunSqliteClient {
  prepare(sql: string): BunSqliteStatement;
  close(): void;
}

export type BunSqliteDatabase<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> = BaseSQLiteDatabase<"sync", void, TSchema>;

/**
 * Only Bun resolves `bun:sqlite`; a static import would stop the config loading
 * under Node before the commands module can say to use Bun.
 */
function loadBunSqlite(): typeof BunSqlite {
  // Safety: Bun hands back its own `bun:sqlite` module for this id; under Node
  // it is undefined, and nothing opens a database there.
  return process.getBuiltinModule("bun:sqlite") as typeof BunSqlite;
}

/**
 * Bun can't bind a raw Date: it takes it for a named-parameter object and binds
 * NULL. Epoch milliseconds matches libsql and `nodeSqlite`.
 */
const bind = (params: BindValue[]): BunSqlite.SQLQueryBindings[] =>
  params.map((value) => (value instanceof Date ? value.valueOf() : value));

const rowsReturned = (rows: readonly unknown[]): number => rows.length;
const rowsChanged = (result: BunSqlite.Changes): number => result.changes;

/**
 * Bun bug, reproduced on 1.4.2: `changes` counts trigger-written rows, so read
 * SQL's `changes()`, and only when Bun reports a change since it carries over.
 */
function exactChanges(
  counter: BunSqlite.Statement<{ changes: number }>,
  result: BunSqlite.Changes,
): BunSqlite.Changes {
  if (result.changes === 0) return result;
  const changes = counter.get()?.changes ?? result.changes;
  return { ...result, changes };
}

function statement(
  stmt: BunSqlite.Statement<unknown, BunSqlite.SQLQueryBindings[]>,
  sql: string,
  counter: BunSqlite.Statement<{ changes: number }>,
): BunSqliteStatement {
  return {
    run: (...params) =>
      traceDbQuerySync(
        { sql, params },
        () => exactChanges(counter, stmt.run(...bind(params))),
        rowsChanged,
      ),
    all: (...params) =>
      traceDbQuerySync(
        { sql, params },
        () => stmt.all(...bind(params)),
        rowsReturned,
      ),
    values: (...params) =>
      traceDbQuerySync(
        { sql, params },
        () => stmt.values(...bind(params)),
        rowsReturned,
      ),
  };
}

/**
 * Bun's defaults (foreign keys off, no busy timeout, rollback journal,
 * `synchronous = FULL`) are overridden; NORMAL is crash-durable under WAL.
 */
export function openBunSqlite(path: string): BunSqliteClient {
  mkdirSync(dirname(path), { recursive: true });
  const { Database } = loadBunSqlite();
  const database = new Database(path);
  database.run("PRAGMA journal_mode = WAL");
  database.run(`PRAGMA busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
  database.run("PRAGMA synchronous = NORMAL");
  database.run("PRAGMA foreign_keys = ON");
  const counter = database.prepare<{ changes: number }, []>(
    "SELECT changes() AS changes",
  );
  return {
    prepare: (sql) =>
      statement(
        database.prepare<unknown, BunSqlite.SQLQueryBindings[]>(sql),
        sql,
        counter,
      ),
    close: () => database.close(),
  };
}

export function drizzleBunSqlite<TSchema extends Record<string, unknown>>(
  client: BunSqliteClient,
  schema: TSchema,
): BunSqliteDatabase<TSchema> {
  const dialect = new SQLiteSyncDialect({ casing: "snake_case" });
  const tables = extractTablesRelationalConfig<
    ExtractTablesWithRelations<TSchema>
  >(schema, createTableRelationsHelpers);
  const relational = {
    fullSchema: schema,
    schema: tables.tables,
    tableNamesMap: tables.tableNamesMap,
  };
  const session = new SQLiteBunSession<
    TSchema,
    ExtractTablesWithRelations<TSchema>
  >(
    // Safety: the session calls only `prepare`, then `run`, `all` and `values`,
    // the members this client wraps; core never calls `transaction`.
    client as BunSqlite.Database,
    dialect,
    relational,
  );
  return new BaseSQLiteDatabase<"sync", void, TSchema>(
    "sync",
    dialect,
    session,
    relational,
  );
}
