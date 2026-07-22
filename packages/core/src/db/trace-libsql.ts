import type {
  Client,
  InStatement,
  ResultSet,
  TransactionMode,
} from "@libsql/client";

import type { TracedQuery } from "./trace.js";
import { traceDbBatch, traceDbQuery } from "./trace.js";

// drizzle binds positionally; named-args objects are a direct-client shape
// this wrap never sees, so they degrade to "no params".
const stmtQuery = (stmt: InStatement): TracedQuery =>
  typeof stmt === "string"
    ? { sql: stmt, params: [] }
    : { sql: stmt.sql, params: Array.isArray(stmt.args) ? stmt.args : [] };

const resultRows = (result: ResultSet): number =>
  result.rows.length > 0 ? result.rows.length : result.rowsAffected;

// The query surface a client and a transaction share — the two objects
// drizzle's libsql session issues statements through.
interface QueryTarget {
  execute(stmt: InStatement): Promise<ResultSet>;
  batch(stmts: InStatement[], ...rest: never[]): Promise<ResultSet[]>;
}

function wrapQueryTarget<T extends QueryTarget>(target: T): T {
  const rawExecute = target.execute.bind(target);
  target.execute = (stmt: InStatement) =>
    traceDbQuery(stmtQuery(stmt), () => rawExecute(stmt), resultRows);

  // Relational reads run as one batched round-trip; time the whole batch as a
  // single span.
  const rawBatch = target.batch.bind(target);
  target.batch = (stmts: InStatement[], ...rest: never[]) =>
    traceDbBatch(
      stmts.map(stmtQuery),
      () => rawBatch(stmts, ...rest),
      resultRows,
    );

  return target;
}

/**
 * Wraps a libsql client so every query — `execute`, `batch`, and statements
 * inside an interactive `transaction` — runs through {@link traceDbQuery} /
 * {@link traceDbBatch}: one timed `db: <kind>` span each, with sql/params/rows
 * attributes. Applied unconditionally at adapter construction; without an
 * active collector the spans are no-ops, so production with no telemetry
 * consumer pays nothing.
 *
 * Assumes drizzle's single-argument call convention (`execute(stmt)`,
 * `batch(stmts)`); it forwards only that first argument, so a direct
 * `execute(sql, args)` call would drop its params.
 */
export function traceSqlClient(client: Client): Client {
  wrapQueryTarget(client);

  // drizzle runs in-transaction statements through the Transaction object's
  // own execute/batch — wrap each transaction as it opens.
  const rawTransaction = client.transaction.bind(client);
  client.transaction = async (mode?: TransactionMode) =>
    wrapQueryTarget(await rawTransaction(mode));

  return client;
}
