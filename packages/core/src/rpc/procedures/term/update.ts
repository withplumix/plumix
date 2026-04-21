import type { NewTerm } from "../../../db/schema/terms.js";
import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { stripUndefined } from "../post/helpers.js";
import { parentWouldCreateCycle, taxonomyCapability } from "./helpers.js";
import { termUpdateInputSchema } from "./schemas.js";

export const update = base
  .use(authenticated)
  .input(termUpdateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:term.update:input",
      input,
    );

    const existing = await context.db.query.terms.findFirst({
      where: eq(terms.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "term", id: filtered.id } });
    }

    const editCap = taxonomyCapability(existing.taxonomy, "edit");
    if (!context.auth.can(editCap)) {
      throw errors.FORBIDDEN({ data: { capability: editCap } });
    }

    if (
      filtered.parentId !== undefined &&
      filtered.parentId !== null &&
      filtered.parentId !== existing.parentId
    ) {
      if (filtered.parentId === existing.id) {
        throw errors.CONFLICT({ data: { reason: "parent_is_self" } });
      }
      const parent = await context.db.query.terms.findFirst({
        where: and(
          eq(terms.id, filtered.parentId),
          eq(terms.taxonomy, existing.taxonomy),
        ),
      });
      if (!parent) {
        throw errors.CONFLICT({ data: { reason: "parent_mismatch" } });
      }
      if (
        await parentWouldCreateCycle(context.db, existing.id, filtered.parentId)
      ) {
        throw errors.CONFLICT({ data: { reason: "parent_cycle" } });
      }
    }

    const { id: _id, ...changes } = filtered;
    const patch: Partial<NewTerm> = stripUndefined(changes);
    if (Object.keys(patch).length === 0) {
      return context.hooks.applyFilter("rpc:term.update:output", existing);
    }

    let updated;
    try {
      [updated] = await context.db
        .update(terms)
        .set(patch)
        .where(eq(terms.id, existing.id))
        .returning();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw errors.CONFLICT({ data: { reason: "slug_taken" } });
      }
      throw error;
    }
    if (!updated) {
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    await context.hooks.doAction("term:updated", updated, existing);
    return context.hooks.applyFilter("rpc:term.update:output", updated);
  });
