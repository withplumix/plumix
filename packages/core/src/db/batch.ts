import type { BatchItem, BatchResponse } from "drizzle-orm/batch";

import type { Db } from "../context/app-context.js";

/** Drizzle's query builders run when awaited, so a driver with no batch can too. */
type Statement = BatchItem<"sqlite"> & PromiseLike<unknown>;
type Statements = readonly [Statement, ...Statement[]];

type Batchable = Db & {
  batch<T extends Statements>(items: T): Promise<BatchResponse<T>>;
};

function canBatch(db: Db): db is Batchable {
  return "batch" in db && typeof db.batch === "function";
}

/**
 * A driver with `batch` commits the statements together or not at all; one
 * without runs them in turn.
 */
export async function runBatch<T extends Statements>(
  db: Db,
  statements: T,
): Promise<BatchResponse<T>> {
  if (canBatch(db)) return db.batch(statements);
  const results: unknown[] = [];
  for (const statement of statements) results.push(await statement);
  return results as BatchResponse<T>;
}
