import type { Db } from "../context/app-context.js";
import { etagOf } from "../db/concurrency.js";
import { eq } from "../db/index.js";
import { users } from "../db/schema/users.js";

/**
 * The `etag` a client reading the user now would hold, for a test whose
 * subject is not the concurrency token.
 */
export async function currentUserEtag(db: Db, id: number): Promise<string> {
  const [row] = await db
    .select({ updatedAt: users.updatedAt })
    .from(users)
    .where(eq(users.id, id));
  if (!row) throw new Error(`No user ${String(id)} to read an etag from`);
  return etagOf(row.updatedAt);
}
