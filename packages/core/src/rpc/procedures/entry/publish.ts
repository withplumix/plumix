import * as v from "valibot";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { deleteAutosave, getAutosave } from "../../../revisions/repository.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../validation.js";
import { assertExpectedLiveUpdatedAt } from "./concurrency.js";
import {
  applyEntryBeforeSave,
  captureRevisionIfSupported,
  entryCapability,
  fireEntryTransition,
  fireEntryUpdated,
} from "./lifecycle.js";

const publishInput = v.object({
  id: idParam,
  // Required for the publish path — promoting a pending draft over a
  // live row is the canonical concurrency battleground. Callers must
  // round-trip the live `updatedAt` they observed when loading the
  // editor; mismatched tokens fail loudly rather than silently
  // clobbering a parallel write.
  expectedLiveUpdatedAt: v.date(),
});

// Promotes the caller's autosave row onto the live entry. Mirrors the
// transactional shape of `entry.update` minus the pre-save filter
// (the autosave was already filtered when it was written): copy the
// pending fields onto live, capture a revision via the existing
// revisions-on-live-write semantics, delete the autosave.
//
// Errors:
//   CONFLICT { reason: "stale_expected_updated_at" }
//   NOT_FOUND  - no live entry / reserved-type row
//   FORBIDDEN  - missing publish capability
//   NO_PENDING_DRAFT - caller has no autosave for this entry
export const publish = base
  .use(authenticated)
  .input(publishInput)
  .handler(async ({ input, context, errors }) => {
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, input.id),
    });
    if (!live || isReservedType(live.type)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: input.id } });
    }
    const publishCapability = entryCapability(live.type, "publish");
    if (!context.auth.can(publishCapability)) {
      throw errors.FORBIDDEN({ data: { capability: publishCapability } });
    }
    assertExpectedLiveUpdatedAt(input.expectedLiveUpdatedAt, live.updatedAt, {
      stale: () => {
        throw errors.CONFLICT({
          data: { reason: "stale_expected_updated_at" },
        });
      },
    });
    const autosave = await getAutosave(context.db, {
      entryId: live.id,
      authorId: context.user.id,
    });
    if (!autosave) {
      throw errors.BAD_REQUEST({ data: { reason: "no_pending_draft" } });
    }

    // Copy the autosave fields onto the live row. Slug + parentId
    // stay anchored to live (the autosave envelope carries them
    // only for restore-from-revision flows, not for publish, which
    // promotes content onto an already-existing slug).
    const patch = {
      title: autosave.title,
      content: autosave.content,
      excerpt: autosave.excerpt,
      // Autosave's meta carries the snapshot envelope — strip it
      // before writing back so the live row doesn't accrue a stale
      // envelope reference.
      meta: stripSnapshotEnvelope(autosave.meta),
    };
    const prepared = await applyEntryBeforeSave(context, live.type, {
      ...live,
      ...patch,
    });
    const toWrite = {
      title: prepared.title,
      content: prepared.content,
      excerpt: prepared.excerpt,
      meta: prepared.meta,
    };
    const [updatedRow] = await context.db
      .update(entries)
      .set(toWrite)
      .where(eq(entries.id, live.id))
      .returning();
    if (!updatedRow) {
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    // Drop the autosave before firing hooks so a subscriber that
    // re-reads the row state observes a clean "no pending draft"
    // post-publish.
    await deleteAutosave(context.db, {
      entryId: live.id,
      authorId: context.user.id,
    });

    await fireEntryUpdated(context, updatedRow, live);
    await fireEntryTransition(context, updatedRow, live.status);
    await captureRevisionIfSupported(context, updatedRow);
    return updatedRow;
  });

// Snapshot envelope key — duplicated rather than imported to keep this
// file's dependency surface tight. Worth folding into a shared helper
// if a third consumer appears.
const SNAPSHOT_META_KEY = "__plumix_snapshot";

function stripSnapshotEnvelope(
  meta: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next = { ...meta };
  delete next[SNAPSHOT_META_KEY];
  return next;
}
