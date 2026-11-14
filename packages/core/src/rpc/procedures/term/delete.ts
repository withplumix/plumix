import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { Term } from "../../../db/schema/terms.js";
import { spellTermCapability } from "../../../access/contract/capability.js";
import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { term } from "../../../events-and-filters/term.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { termRpc } from "../../filters.js";
import { writeErrors as errors } from "../entry/writes-shared.js";
import { termWire } from "./helpers.js";
import { termDeleteInputSchema } from "./schemas.js";

/** `gate` checks the loaded row. */
export async function deleteTerm(
  context: AuthenticatedAppContext,
  id: number,
  gate?: (existing: Term) => void,
): Promise<Term> {
  const existing = await context.db.query.terms.findFirst({
    where: eq(terms.id, id),
  });
  if (!existing) {
    throw errors.NOT_FOUND({ data: { kind: "term", id } });
  }
  gate?.(existing);

  // Re-parented here rather than by the self-reference's `onDelete: set
  // null`, which can't move each child's token; the column's `$onUpdate`
  // does. entry_term cascades via the FK.
  await context.db
    .update(terms)
    .set({ parentId: null })
    .where(eq(terms.parentId, existing.id));
  const [deleted] = await context.db
    .delete(terms)
    .where(eq(terms.id, existing.id))
    .returning();
  if (!deleted) {
    throw errors.CONFLICT({ data: { reason: "delete_failed" } });
  }

  await context.events.emit(term.for(deleted.taxonomy).deleted, {
    term: deleted,
  });
  return deleted;
}

export const del = base
  .use(authenticated)
  .input(termDeleteInputSchema)
  .handler(async ({ input, context }) => {
    const deleted = await deleteTerm(context, input.id, (existing) => {
      const deleteCap = spellTermCapability(existing.taxonomy, "delete");
      if (!context.auth.can(deleteCap)) {
        throw errors.FORBIDDEN({ data: { capability: deleteCap } });
      }
    });
    return termWire(
      await context.filters.apply(termRpc.delete.output, deleted),
    );
  });
