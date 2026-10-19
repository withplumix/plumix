import type { NewTerm } from "../../../db/schema/terms.js";
import { spellTermCapability } from "../../../access/contract/capability.js";
import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { assertTermCopyCurrent, claimTerm } from "../../../db/term-claim.js";
import { isEmptyMetaPatch, patchedMetaBag } from "../../../meta/core.js";
import {
  announceTermMetaChange,
  assertTermMetaCapabilities,
  resolveTermMeta,
  sanitizeMetaForRpc,
  validateTermMetaReferences,
} from "../../../meta/term.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { assertLeaseAllows } from "../../concurrency.js";
import { stripUndefined } from "../entry/helpers.js";
import { parentWouldCreateCycle, termWire } from "./helpers.js";
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

    const editCap = spellTermCapability(existing.taxonomy, "edit");
    if (!context.auth.can(editCap)) {
      throw errors.FORBIDDEN({ data: { capability: editCap } });
    }
    await assertLeaseAllows(
      context,
      { kind: "term", id: existing.id },
      filtered.takeOver,
    );
    assertTermCopyCurrent(filtered.ifMatch, existing);

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

    const {
      id: _id,
      meta: metaInput,
      ifMatch,
      takeOver: _takeOver,
      ...changes
    } = filtered;
    const metaPatch = await sanitizeMetaForRpc(
      context.plugins,
      existing.taxonomy,
      metaInput,
      { stored: existing.meta, auth: context.auth },
      errors,
    );
    if (metaPatch) {
      assertTermMetaCapabilities(
        context.plugins,
        existing.taxonomy,
        metaPatch,
        context.auth,
        errors,
      );
      await validateTermMetaReferences(
        context,
        existing.taxonomy,
        metaPatch,
        errors,
      );
    }

    const patch: Partial<NewTerm> = stripUndefined(changes);
    const metaChanged = !isEmptyMetaPatch(metaPatch);

    // Nothing to write anywhere? Return the existing row with its
    // decoded meta for a consistent response shape.
    if (Object.keys(patch).length === 0 && !metaChanged) {
      const meta = await resolveTermMeta(
        context,
        existing.taxonomy,
        existing.meta,
      );
      return termWire(
        await context.hooks.applyFilter("rpc:term.update:output", {
          ...existing,
          meta,
        }),
      );
    }

    let updated;
    try {
      updated = await claimTerm(context.db, existing.id, ifMatch, {
        ...patch,
        // Merged from the row read above; the claim refuses if it moved.
        ...(metaChanged
          ? { meta: patchedMetaBag(existing.meta, metaPatch) }
          : {}),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw errors.CONFLICT({ data: { reason: "slug_taken" } });
      }
      throw error;
    }
    if (!updated) {
      throw errors.NOT_FOUND({ data: { kind: "term", id: existing.id } });
    }

    if (metaPatch && metaChanged) {
      await announceTermMetaChange(context, updated, metaPatch);
    }
    if (Object.keys(patch).length > 0) {
      await context.hooks.doAction("term:updated", updated, existing, context);
    }
    const meta = await resolveTermMeta(context, updated.taxonomy, updated.meta);
    return termWire(
      await context.hooks.applyFilter("rpc:term.update:output", {
        ...updated,
        meta,
      }),
    );
  });
