import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { taxonomyCapability } from "./helpers.js";
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

    const deleteCap = taxonomyCapability(existing.taxonomy, "delete");
    if (!context.auth.can(deleteCap)) {
      throw errors.FORBIDDEN({ data: { capability: deleteCap } });
    }

    // post_term cascades via the FK; children terms get parentId = null via
    // the terms.parentId self-reference `onDelete: set null`.
    const [deleted] = await context.db
      .delete(terms)
      .where(eq(terms.id, existing.id))
      .returning();
    if (!deleted) {
      throw errors.CONFLICT({ data: { reason: "delete_failed" } });
    }

    await context.hooks.doAction("term:deleted", deleted);
    return context.hooks.applyFilter("rpc:term.delete:output", deleted);
  });
