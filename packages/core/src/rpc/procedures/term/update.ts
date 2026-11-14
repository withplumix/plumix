import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { NewTerm, Term } from "../../../db/schema/terms.js";
import type { TermUpdateInput } from "./schemas.js";
import type { TermWritten } from "./writes-shared.js";
import { spellTermCapability } from "../../../access/contract/capability.js";
import { etagOf } from "../../../db/concurrency.js";
import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { assertTermCopyCurrent, claimTerm } from "../../../db/term-claim.js";
import { term } from "../../../events-and-filters/term.js";
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
import { termRpc } from "../../filters.js";
import { stripUndefined } from "../entry/helpers.js";
import { writeErrors as errors } from "../entry/writes-shared.js";
import { parentWouldCreateCycle, termWire } from "./helpers.js";
import { termUpdateInputSchema } from "./schemas.js";

export const update = base
  .use(authenticated)
  .input(termUpdateInputSchema)
  .handler(async ({ input, context }) => {
    const filtered = await context.filters.apply(termRpc.update.input, input);

    const { term: updated, meta } = await updateTerm(
      context,
      filtered,
      (existing) => {
        const editCap = spellTermCapability(existing.taxonomy, "edit");
        if (!context.auth.can(editCap)) {
          throw errors.FORBIDDEN({ data: { capability: editCap } });
        }
      },
    );
    return termWire(
      await context.filters.apply(termRpc.update.output, {
        ...updated,
        meta,
      }),
    );
  });

/** `gate` checks the loaded row. */
export async function updateTerm(
  context: AuthenticatedAppContext,
  filtered: TermUpdateInput,
  gate?: (existing: Term) => void,
): Promise<TermWritten> {
  const existing = await context.db.query.terms.findFirst({
    where: eq(terms.id, filtered.id),
  });
  if (!existing) {
    throw errors.NOT_FOUND({ data: { kind: "term", id: filtered.id } });
  }

  gate?.(existing);
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
    return { term: existing, meta, etag: etagOf(existing.version) };
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
    await context.events.emit(term.for(updated.taxonomy).updated, {
      term: updated,
      previous: existing,
    });
  }
  const meta = await resolveTermMeta(context, updated.taxonomy, updated.meta);
  return { term: updated, meta, etag: etagOf(updated.version) };
}
