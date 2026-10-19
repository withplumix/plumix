import type { Db } from "../../../context/app-context.js";
import type { NewTerm, Term } from "../../../db/schema/terms.js";
import {
  claimVersion,
  ConflictError,
  etagOf,
} from "../../../db/concurrency.js";
import { and, eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";

/** A term on the wire: its `version` travels as the opaque `etag`. */
export function termWire<T extends { readonly version: number }>({
  version,
  ...rest
}: T): Omit<T, "version"> & { readonly etag: string } {
  return { ...rest, etag: etagOf(version) };
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

/**
 * A system write: lands only while the row holds the version `decide` read,
 * else re-reads and decides again. `undefined` once the term is gone.
 */
export async function writeTermAsSystem(
  db: Db,
  read: Term,
  decide: (row: Term) => Partial<NewTerm> | undefined,
): Promise<Term | undefined> {
  let row: Term | undefined = read;
  while (row) {
    const changes = decide(row);
    if (changes === undefined) return row;
    const [updated] = await db
      .update(terms)
      .set({ ...changes, version: row.version + 1 })
      .where(and(eq(terms.id, row.id), eq(terms.version, row.version)))
      .returning();
    if (updated) return updated;
    row = await db.query.terms.findFirst({ where: eq(terms.id, row.id) });
  }
  return undefined;
}
