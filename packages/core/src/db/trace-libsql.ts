import type {
  Client,
  InStatement,
  ResultSet,
  TransactionMode,
} from "@libsql/client";

import type { TracedQuery } from "./trace.js";
import { traceDbBatch, traceDbQuery } from "./trace.js";

/**
 * drizzle binds positionally; named-args objects are a direct-client shape
 * this wrap never sees, so they degrade to "no params".
 */
const stmtQuery = (stmt: InStatement): TracedQuery =>
  typeof stmt === "string"
    ? { sql: stmt, params: [] }
    : { sql: stmt.sql, params: Array.isArray(stmt.args) ? stmt.args : [] };

const resultRows = (result: ResultSet): number =>
  result.rows.length > 0 ? result.rows.length : result.rowsAffected;

/**
 * The query surface a client and a transaction share — the two objects
 * drizzle's libsql session issues statements through.
 */
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
 * Forwards only the first argument, drizzle's convention, so a direct
 * `execute(sql, args)` would drop its params.
 */
export function traceSqlClient(client: Client): Client {
  wrapQueryTarget(client);

  // Only the zero-argument `transaction()` overload is deprecated, but a bare
  // reference can't pick an overload.
  /* eslint-disable @typescript-eslint/no-deprecated */
  const rawTransaction = client.transaction.bind(client);
  client.transaction = async (mode?: TransactionMode) =>
    wrapQueryTarget(await rawTransaction(mode));
  /* eslint-enable @typescript-eslint/no-deprecated */

  return client;
}
