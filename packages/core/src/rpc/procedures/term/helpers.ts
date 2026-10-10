import type { Db } from "../../../context/app-context.js";
import type { Term } from "../../../db/schema/terms.js";
import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";

/**
 * Returns true on hitting the depth cap, refusing rather than extending a
 * pre-existing corrupt cycle.
 */
export async function parentWouldCreateCycle(
  db: Db,
  selfId: number,
  candidateParentId: number,
): Promise<boolean> {
  const MAX_DEPTH = 100;
  let currentId: number | null = candidateParentId;
  for (let hop = 0; hop < MAX_DEPTH && currentId !== null; hop++) {
    if (currentId === selfId) return true;
    // Explicit annotation works around a drizzle recursive-type quirk.
    const row: Pick<Term, "parentId"> | undefined =
      await db.query.terms.findFirst({
        columns: { parentId: true },
        where: eq(terms.id, currentId),
      });
    if (!row) return false;
    currentId = row.parentId;
  }
  // Exhausted the cap without reaching the root — pre-existing corrupt cycle
  // or impossibly deep tree. Treat as unsafe.
  return currentId !== null;
}
