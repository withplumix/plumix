import type { NewTerm } from "../../../db/schema/terms.js";
import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { isEmptyMetaPatch } from "../../meta/core.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { stripUndefined } from "../entry/helpers.js";
import { parentWouldCreateCycle, taxonomyCapability } from "./helpers.js";
import {
  decodeMetaBag,
  loadTermMeta,
  sanitizeMetaForRpc,
  writeTermMeta,
} from "./meta.js";
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

    const { id: _id, meta: metaInput, ...changes } = filtered;
    const metaPatch = sanitizeMetaForRpc(
      context.plugins,
      existing.taxonomy,
      metaInput,
      errors,
    );

    const patch: Partial<NewTerm> = stripUndefined(changes);

    // Nothing to write anywhere? Return the existing row with its
    // decoded meta for a consistent response shape.
    if (Object.keys(patch).length === 0 && isEmptyMetaPatch(metaPatch)) {
      const meta = decodeMetaBag(
        context.plugins,
        existing.taxonomy,
        existing.meta,
      );
      return context.hooks.applyFilter("rpc:term.update:output", {
        ...existing,
        meta,
      });
    }

    let updated = existing;
    let rowWritten = false;
    if (Object.keys(patch).length > 0) {
      try {
        const [row] = await context.db
          .update(terms)
          .set(patch)
          .where(eq(terms.id, existing.id))
          .returning();
        if (!row) {
          throw errors.CONFLICT({ data: { reason: "update_failed" } });
        }
        updated = row;
        rowWritten = true;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw errors.CONFLICT({ data: { reason: "slug_taken" } });
        }
        throw error;
      }
    }

    let meta: Record<string, unknown>;
    if (metaPatch) {
      await writeTermMeta(context, updated, metaPatch);
      meta = await loadTermMeta(context, updated);
    } else {
      meta = decodeMetaBag(context.plugins, updated.taxonomy, updated.meta);
    }

    if (rowWritten) {
      await context.hooks.doAction("term:updated", updated, existing);
    }
    return context.hooks.applyFilter("rpc:term.update:output", {
      ...updated,
      meta,
    });
  });
