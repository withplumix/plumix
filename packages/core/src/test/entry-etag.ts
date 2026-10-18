import type { Db } from "../context/app-context.js";
import { etagOf } from "../db/concurrency.js";
import { eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";

/**
 * The `etag` a client reading the entry now would hold, for a test whose
 * subject is not the concurrency token.
 */
export async function currentEtag(db: Db, id: number): Promise<string> {
  const [row] = await db
    .select({ updatedAt: entries.updatedAt })
    .from(entries)
    .where(eq(entries.id, id));
  if (!row) throw new Error(`No entry ${String(id)} to read an etag from`);
  return etagOf(row.updatedAt);
}
