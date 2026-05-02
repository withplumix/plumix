import type { AuthenticatedAppContext } from "../../../context/app.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import { and, eq, isUniqueConstraintError, ne } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { isEmptyMetaPatch } from "../../meta/core.js";
import { assertContentWithinByteCap } from "./content.js";
import { stripUndefined } from "./helpers.js";
import {
  applyEntryBeforeSave,
  entryCapability,
  fireEntryPublished,
  fireEntryTransition,
  fireEntryUpdated,
  loadReadableParent,
  wouldCreateParentCycle,
} from "./lifecycle.js";
import {
  decodeMetaBag,
  loadEntryMeta,
  sanitizeMetaForRpc,
  writeEntryMeta,
} from "./meta.js";
import { entryUpdateInputSchema } from "./schemas.js";
import {
  applyTermPatch,
  assertTermsPatchValid,
  buildTermsPatchGuards,
} from "./terms.js";

interface AccessGuards {
  readonly forbidden: (capability: string) => never;
}

interface ParentGuards {
  readonly notFound: (parentId: number) => never;
  readonly cycle: () => never;
}

interface ColumnWriteGuards {
  readonly slugTaken: () => never;
  readonly updateFailed: () => never;
}

function assertCanEditEntry(
  context: AuthenticatedAppContext,
  existing: Entry,
  guards: AccessGuards,
): void {
  const isAuthor = existing.authorId === context.user.id;
  const editOwnCapability = entryCapability(existing.type, "edit_own");
  const editAnyCapability = entryCapability(existing.type, "edit_any");
  const canEdit =
    (isAuthor && context.auth.can(editOwnCapability)) ||
    context.auth.can(editAnyCapability);
  if (!canEdit) guards.forbidden(editAnyCapability);
}

function assertCanPublishTransition(
  context: AuthenticatedAppContext,
  existing: Entry,
  guards: AccessGuards,
): void {
  const publishCapability = entryCapability(existing.type, "publish");
  if (!context.auth.can(publishCapability)) guards.forbidden(publishCapability);
}

// Reparenting: caller may only point at entries they can see, and the
// parent must share the current entry's type. Undistinguished 404 on
// any failure — don't leak whether the parent exists. Also walk the
// chain upward to reject cycles of any depth (self-parent, A→B→A, …) —
// admin UI tree renders will infinite-loop on any cycle in the DB.
async function assertParentReassignmentValid(
  context: AuthenticatedAppContext,
  existing: Entry,
  newParentId: number,
  guards: ParentGuards,
): Promise<void> {
  const parent = await loadReadableParent(context, existing.type, newParentId);
  if (!parent) guards.notFound(newParentId);
  const cycle = await wouldCreateParentCycle(context, existing.id, parent.id);
  if (cycle) guards.cycle();
}

async function writeEntryColumns(
  context: AuthenticatedAppContext,
  existing: Entry,
  patch: Partial<NewEntry>,
  isPublishTransition: boolean,
  guards: ColumnWriteGuards,
): Promise<{ readonly updated: Entry; readonly postColumnsWritten: boolean }> {
  const preparedFull = await applyEntryBeforeSave(context, existing.type, {
    ...existing,
    ...patch,
  });
  const toWrite: Partial<NewEntry> = {};
  for (const key of Object.keys(patch) as (keyof NewEntry)[]) {
    (toWrite as Record<string, unknown>)[key] = preparedFull[key];
  }

  // The ne(status, "published") guard on publish transitions can match
  // zero rows if another request won the publish race.
  const where = isPublishTransition
    ? and(eq(entries.id, existing.id), ne(entries.status, "published"))
    : eq(entries.id, existing.id);

  let row;
  try {
    [row] = await context.db
      .update(entries)
      .set(toWrite)
      .where(where)
      .returning();
  } catch (error) {
    if (isUniqueConstraintError(error)) guards.slugTaken();
    throw error;
  }
  if (row) return { updated: row, postColumnsWritten: true };
  if (!isPublishTransition) guards.updateFailed();
  // Race-lost: someone published between our read and write. Return the
  // current state as observed, do not fire the updated/published hooks.
  const current = await context.db.query.entries.findFirst({
    where: eq(entries.id, existing.id),
  });
  if (!current) guards.updateFailed();
  return { updated: current, postColumnsWritten: false };
}

export const update = base
  .use(authenticated)
  .input(entryUpdateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.update:input",
      input,
    );

    assertContentWithinByteCap(filtered.content, errors);

    const existing = await context.db.query.entries.findFirst({
      where: eq(entries.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    const accessGuards: AccessGuards = {
      forbidden: (capability) => {
        throw errors.FORBIDDEN({ data: { capability } });
      },
    };
    assertCanEditEntry(context, existing, accessGuards);

    const isPublishTransition =
      filtered.status === "published" && existing.status !== "published";
    if (isPublishTransition) {
      assertCanPublishTransition(context, existing, accessGuards);
    }

    if (filtered.parentId != null && filtered.parentId !== existing.parentId) {
      await assertParentReassignmentValid(
        context,
        existing,
        filtered.parentId,
        {
          notFound: (parentId) => {
            throw errors.NOT_FOUND({ data: { kind: "entry", id: parentId } });
          },
          cycle: () => {
            throw errors.CONFLICT({ data: { reason: "parent_cycle" } });
          },
        },
      );
    }

    // `terms` and `meta` aren't entries.* columns — split them out and
    // validate up front so a bad taxonomy/cap/meta key fails fast,
    // before any write happens.
    const {
      id: _id,
      terms: termsPatch,
      meta: metaInput,
      ...changes
    } = filtered;
    const metaPatch = sanitizeMetaForRpc(
      context.plugins,
      existing.type,
      metaInput,
      errors,
    );
    if (termsPatch !== undefined) {
      await assertTermsPatchValid(
        context,
        termsPatch,
        buildTermsPatchGuards(errors),
      );
    }

    const patch: Partial<NewEntry> = stripUndefined(changes);
    if (isPublishTransition && !existing.publishedAt) {
      patch.publishedAt = new Date();
    }

    // Nothing to write anywhere? Short-circuit without firing hooks, but
    // still return the current meta so callers get a consistent shape. An
    // empty meta map from the client (e.g. admin always sending `meta: {}`)
    // counts as no-op on the meta side too.
    if (
      Object.keys(patch).length === 0 &&
      termsPatch === undefined &&
      isEmptyMetaPatch(metaPatch)
    ) {
      const meta = decodeMetaBag(context.plugins, existing, existing.meta);
      return context.hooks.applyFilter("rpc:entry.update:output", {
        ...existing,
        meta,
      });
    }

    let updated: Entry = existing;
    let postColumnsWritten = false;
    if (Object.keys(patch).length > 0) {
      const result = await writeEntryColumns(
        context,
        existing,
        patch,
        isPublishTransition,
        {
          slugTaken: () => {
            throw errors.CONFLICT({ data: { reason: "slug_taken" } });
          },
          updateFailed: () => {
            throw errors.CONFLICT({ data: { reason: "update_failed" } });
          },
        },
      );
      updated = result.updated;
      postColumnsWritten = result.postColumnsWritten;
    }

    if (termsPatch !== undefined) {
      await applyTermPatch(context, updated.id, termsPatch);
    }

    // `writeEntryMeta` is a no-op on an empty patch, so the null check
    // here is the only gate we need.
    let meta: Record<string, unknown>;
    if (metaPatch) {
      await writeEntryMeta(context, updated, metaPatch);
      meta = await loadEntryMeta(context, updated);
    } else {
      meta = decodeMetaBag(context.plugins, updated, updated.meta);
    }

    if (postColumnsWritten) {
      await fireEntryUpdated(context, updated, existing);
      await fireEntryTransition(context, updated, existing.status);
      if (isPublishTransition) {
        await fireEntryPublished(context, updated);
      }
    }

    return context.hooks.applyFilter("rpc:entry.update:output", {
      ...updated,
      meta,
    });
  });
