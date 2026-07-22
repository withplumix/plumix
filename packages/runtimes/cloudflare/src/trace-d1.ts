import type { TracedQuery } from "plumix";
import { traceDbBatch, traceDbQuery } from "plumix";

// Links a traced statement back to the real bound statement (for `batch`) and
// to its sql/params (for the batch span's attributes).
const ORIGINAL = Symbol("plumix.d1.original");
const QUERY = Symbol("plumix.d1.query");

interface TracedStatement extends D1PreparedStatement {
  readonly [ORIGINAL]: D1PreparedStatement;
  readonly [QUERY]: TracedQuery;
}

function d1Rows(result: D1Result): number {
  return result.results.length > 0
    ? result.results.length
    : result.meta.changes;
}

function traceStatement(
  stmt: D1PreparedStatement,
  sql: string,
  params: readonly unknown[],
): D1PreparedStatement {
  const query: TracedQuery = { sql, params };
  const traced: TracedStatement = {
    [ORIGINAL]: stmt,
    [QUERY]: query,
    bind: (...values) => traceStatement(stmt.bind(...values), sql, values),
    run: () => traceDbQuery(query, () => stmt.run(), d1Rows),
    all: () => traceDbQuery(query, () => stmt.all(), d1Rows),
    raw: (options?: { columnNames?: boolean }) =>
      traceDbQuery(
        query,
        () => stmt.raw(options as never),
        (rows) => rows.length,
      ),
    first: (column?: string) =>
      traceDbQuery(
        query,
        () => (column === undefined ? stmt.first() : stmt.first(column)),
        (row) => (row === null ? 0 : 1),
      ),
  };
  return traced;
}

// The query surface drizzle's d1 session uses — satisfied by both a raw
// `D1Database` binding and a Sessions-API `withSession()` handle.
interface D1QueryTarget {
  prepare: (sql: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<D1Result[]>;
}

/**
 * Wraps a D1 binding (or session) so every statement drizzle prepares runs
 * through {@link traceDbQuery} / {@link traceDbBatch} — one timed `db: <kind>`
 * span per query with sql/params/rows attributes, including the begin/commit
 * statements of drizzle's emulated transactions. Non-mutating (the env-owned
 * binding is isolate-shared): returns a fresh wrapper exposing the two members
 * drizzle's d1 session calls. Without an active collector every span is a no-op.
 * D1 access that bypasses `ctx.db` (e.g. a raw `env` binding) is an untraced
 * platform boundary.
 */
export function traceD1Client<T extends D1QueryTarget>(target: T): T {
  const wrapper: D1QueryTarget = {
    prepare: (sql) => traceStatement(target.prepare(sql), sql, []),
    // Statements always arrive from `wrapper.prepare` — drizzle binds through
    // the same client — so each carries its query and original statement.
    batch: (statements) => {
      const traced = statements as TracedStatement[];
      return traceDbBatch(
        traced.map((stmt) => stmt[QUERY]),
        () => target.batch(traced.map((stmt) => stmt[ORIGINAL])),
        d1Rows,
      );
    },
  };
  return wrapper as T;
}
