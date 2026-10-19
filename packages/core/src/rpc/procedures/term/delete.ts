import { spellTermCapability } from "../../../access/contract/capability.js";
import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { termWire, writeTermAsSystem } from "./helpers.js";
import { termDeleteInputSchema } from "./schemas.js";

export const del = base
  .use(authenticated)
  .input(termDeleteInputSchema)
  .handler(async ({ input, context, errors }) => {
    const existing = await context.db.query.terms.findFirst({
      where: eq(terms.id, input.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "term", id: input.id } });
    }

    const deleteCap = spellTermCapability(existing.taxonomy, "delete");
    if (!context.auth.can(deleteCap)) {
      throw errors.FORBIDDEN({ data: { capability: deleteCap } });
    }

    // Re-parented here rather than by the self-reference's `onDelete: set
    // null`, which can't move each child's token. entry_term cascades via
    // the FK.
    const children = await context.db.query.terms.findMany({
      where: eq(terms.parentId, existing.id),
    });
    for (const child of children) {
      await writeTermAsSystem(context.db, child, (row) =>
        row.parentId === existing.id ? { parentId: null } : undefined,
      );
    }
    const [deleted] = await context.db
      .delete(terms)
      .where(eq(terms.id, existing.id))
      .returning();
    if (!deleted) {
      throw errors.CONFLICT({ data: { reason: "delete_failed" } });
    }

    await context.hooks.doAction("term:deleted", deleted, context);
    return termWire(
      await context.hooks.applyFilter("rpc:term.delete:output", deleted),
    );
  });
