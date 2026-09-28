// Drizzle's own `bun-sqlite` session over a real `bun:sqlite` database. The
// client handed to it is the database with its `prepare` wrapped, for tracing
// and for the two places Bun departs from the other SQLite drivers.
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
> = BaseSQLiteDatabase<"sync", BunSqlite.Changes, TSchema>;

// `bun:sqlite` is a specifier only Bun resolves, so a static import would stop
// a config naming `bunSqlite()` from loading under Node at all — before the
// commands module can say to run on Bun instead.
function loadBunSqlite(): typeof BunSqlite {
  // Safety: Bun hands back its own `bun:sqlite` module for this id; under Node
  // it is undefined, and nothing opens a database there.
  return process.getBuiltinModule("bun:sqlite") as typeof BunSqlite;
}

const bind = (params: BindValue[]): BunSqlite.SQLQueryBindings[] =>
  params as BunSqlite.SQLQueryBindings[];

const rowsReturned = (rows: readonly unknown[]): number => rows.length;
const rowsChanged = (result: BunSqlite.Changes): number =>
  Number(result.changes);

function exactChanges(
  _counter: BunSqlite.Statement<{ changes: number }>,
  result: BunSqlite.Changes,
): BunSqlite.Changes {
  return result;
}

// Every statement drizzle's session issues lands on one of these members, so
// this is where the client earns its query spans. Spans carry the params as
// the caller bound them, as the libsql wrap records them.
function statement(
  stmt: BunSqlite.Statement,
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

// Bun opens a file with foreign keys off, no busy timeout, a rollback journal
// and `synchronous = FULL`, so all four are set here rather than inherited.
// WAL so a reader never blocks the writer; `synchronous = NORMAL` is durable
// across a crash under WAL without an fsync per commit.
export function openBunSqlite(path: string): BunSqliteClient {
  mkdirSync(dirname(path), { recursive: true });
  const { Database } = loadBunSqlite();
  const database = new Database(path);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(`PRAGMA busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA foreign_keys = ON");
  const counter = database.prepare<{ changes: number }, []>(
    "SELECT changes() AS changes",
  );
  return {
    prepare: (sql) => statement(database.prepare(sql), sql, counter),
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
    // Safety: the session calls only `prepare` on its client, then `run`,
    // `all` and `values` on the statement — the members this client wraps.
    // `transaction` it would call for `db.transaction`, which core never does.
    client as BunSqlite.Database,
    dialect,
    relational,
  );
  return new BaseSQLiteDatabase<"sync", BunSqlite.Changes, TSchema>(
    "sync",
    dialect,
    session,
    relational,
  );
}
