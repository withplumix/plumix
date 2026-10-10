// D1's `meta.changes` counts trigger-written rows, so SQL's `changes()` is read
// in the same batch. D1 refuses a bound Date, so it binds as epoch
// milliseconds.

import { D1Error } from "./errors.js";

// Links a wrapped statement back to the real bound one, for `batch`.
const RAW = Symbol("plumix.d1.raw");

interface ClientStatement extends D1PreparedStatement {
  readonly [RAW]: D1PreparedStatement;
}

// The query surface drizzle's d1 session uses — satisfied by both a raw
// `D1Database` binding and a Sessions-API `withSession()` handle.
interface D1QueryTarget {
  prepare: (sql: string) => D1PreparedStatement;
  batch: <T = unknown>(
    statements: D1PreparedStatement[],
  ) => Promise<D1Result<T>[]>;
}

const CHANGES_SQL = "SELECT changes() AS changes";

async function runExact<T>(
  target: D1QueryTarget,
  stmt: D1PreparedStatement,
): Promise<D1Result<T>> {
  // One row type for both results, as a batch has; each reads its own half.
  const results = await target.batch<T & { changes?: number }>([
    stmt,
    target.prepare(CHANGES_SQL),
  ]);
  const [result, counted] = results;
  if (!result || !counted) {
    throw D1Error.batchIncomplete({ expected: 2, received: results.length });
  }
  // `changes()` keeps the last write's count across statements that write
  // nothing, DDL included, so it is only this statement's count when D1 says
  // the statement changed something.
  if (result.meta.changes === 0) return result;
  const changes = counted.results[0]?.changes ?? result.meta.changes;
  return { ...result, meta: { ...result.meta, changes } };
}

function wrapStatement(
  target: D1QueryTarget,
  stmt: D1PreparedStatement,
): D1PreparedStatement {
  const wrapped: ClientStatement = {
    [RAW]: stmt,
    bind: (...values) =>
      wrapStatement(
        target,
        stmt.bind(
          ...values.map((value) =>
            value instanceof Date ? value.valueOf() : value,
          ),
        ),
      ),
    run: <T>() => runExact<T>(target, stmt),
    all: () => stmt.all(),
    raw: (options?: { columnNames?: boolean }) => stmt.raw(options as never),
    first: (column?: string) =>
      column === undefined ? stmt.first() : stmt.first(column),
  };
  return wrapped;
}

/** Non-mutating: the binding is isolate-shared. */
export function d1Client<T extends D1QueryTarget>(target: T): T {
  const wrapper: D1QueryTarget = {
    prepare: (sql) => wrapStatement(target, target.prepare(sql)),
    // Statements always arrive from `wrapper.prepare`, so each carries the
    // real statement the binding's own batch needs.
    batch: (statements) =>
      target.batch((statements as ClientStatement[]).map((stmt) => stmt[RAW])),
  };
  return wrapper as T;
}
