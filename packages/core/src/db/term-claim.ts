import type { Db } from "../context/app-context.js";
import type { NewTerm, Term } from "./schema/terms.js";
import { claimVersion, ConflictError } from "./concurrency.js";
import { and, eq } from "./index.js";
import { terms } from "./schema/terms.js";

/**
 * Refuses a write whose copy the term has moved past, before the work it does
 * ahead of its claim. A menu is a term, refused the same way.
 */
export function assertTermCopyCurrent(
  ifMatch: number,
  term: Pick<Term, "id" | "version">,
): void {
  if (ifMatch !== term.version) {
    throw new ConflictError(term.version, { kind: "term", id: term.id });
  }
}

/**
 * One conditional update: it lands only while the row still holds `ifMatch`,
 * and moves the version. Throws `ConflictError` when another write landed
 * first; `undefined` when the term is gone.
 */
export async function claimTerm(
  db: Db,
  id: number,
  ifMatch: number,
  changes: Partial<NewTerm>,
): Promise<Term | undefined> {
  const guard = claimVersion(terms.version, ifMatch);
  const [row] = await db
    .update(terms)
    .set({ ...changes, ...guard.set })
    .where(and(eq(terms.id, id), guard.where))
    .returning();
  if (row) return row;
  const [current] = await db
    .select({ version: terms.version })
    .from(terms)
    .where(eq(terms.id, id));
  if (current) throw new ConflictError(current.version, { kind: "term", id });
  return undefined;
}
