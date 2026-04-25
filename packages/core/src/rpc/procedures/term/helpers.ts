import type { Db } from "../../../context/app.js";
import type { Term } from "../../../db/schema/terms.js";
import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";

export function taxonomyCapability(taxonomy: string, action: string): string {
  return `term:${taxonomy}:${action}`;
}

/**
 * Follow the parent chain from `candidateParentId` toward the root.
 * Returns true iff `selfId` appears in the chain — i.e., setting
 * selfId.parentId = candidateParentId would create a cycle.
 * Caps traversal depth so a pre-existing cycle can't spin forever;
 * returns true on cap-hit as a conservative default (refuse the change
 * rather than risk extending a corrupt cycle we couldn't finish walking).
 * Explicit annotation on `row` works around a drizzle recursive-type quirk.
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
