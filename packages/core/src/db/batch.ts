import type { BatchItem, BatchResponse } from "drizzle-orm/batch";

import type { Db } from "../context/app-context.js";

/** Drizzle's query builders run when awaited, so the sync drivers can too. */
type Statement = BatchItem<"sqlite"> & PromiseLike<unknown>;
type Statements = readonly [Statement, ...Statement[]];

type Batchable = Db & {
  batch<T extends Statements>(items: T): Promise<BatchResponse<T>>;
};

/** D1 and libSQL send a batch in one round trip; the sync drivers have none. */
function canBatch(db: Db): db is Batchable {
  return "batch" in db && typeof db.batch === "function";
}

/**
 * D1 and libSQL commit the statements together or not at all; the sync
 * drivers run them in turn.
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
