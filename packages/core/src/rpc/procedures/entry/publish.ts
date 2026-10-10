import * as v from "valibot";

import type { JsonObject } from "../../../json.js";
import { entryCapabilityByName } from "../../../access/contract/entry-capabilities.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import { sanitizePromotedEntryMeta } from "../../../meta/entry.js";
import {
  deleteAutosave,
  getAutosaveEdits,
} from "../../../revisions/repository.js";
import {
  autosaveTouchedKeys,
  mergeAutosaveMeta,
  SNAPSHOT_META_KEY,
} from "../../../revisions/snapshot-envelope.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../contract/validation.js";
import { assertExpectedLiveUpdatedAt } from "./concurrency.js";
import {
  applyEntryBeforeSave,
  captureRevisionIfSupported,
  fireEntryTransition,
  fireEntryUpdated,
} from "./lifecycle.js";

const publishInput = v.object({
  id: idParam,
  // Required here, unlike `entry.update`: promoting a draft over live must fail
  // loudly rather than clobber a parallel write.
  expectedLiveUpdatedAt: v.date(),
});

// Skips the pre-save filter: the autosave was filtered when written.
export const publish = base
  .use(authenticated)
  .input(publishInput)
  .handler(async ({ input, context, errors }) => {
    const live = await loadAuthoredEntry(context.db, input.id);
    if (!live) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: input.id } });
    }
    const publishCapability = entryCapabilityByName(
      context.plugins,
      live.type,
      "publish",
    );
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
    const autosave = await getAutosaveEdits(context.db, {
      entryId: live.id,
      authorId: context.user.id,
    });
    if (!autosave) {
      throw errors.BAD_REQUEST({ data: { reason: "no_pending_draft" } });
    }

    // Title, slug and parentId stay on live: title is live-only, and the
    // autosave carries slug and parentId only for restore-from-revision.
    const patch = {
      content: autosave.content,
      excerpt: autosave.excerpt,
      // Autosaves are draft-lenient, so publish is where the merged bag is
      // finally strict-validated, rejecting with per-field errors.
      meta: await sanitizePromotedEntryMeta(
        context,
        live.type,
        stripSnapshotEnvelope(mergeAutosaveMeta(live.meta, autosave.meta)),
        errors,
        autosaveTouchedKeys(autosave.meta),
      ),
    };
    const prepared = await applyEntryBeforeSave(context, live.type, {
      ...live,
      ...patch,
    });
    const toWrite = {
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

function stripSnapshotEnvelope(meta: JsonObject): JsonObject {
  const next = { ...meta };
  delete next[SNAPSHOT_META_KEY];
  return next;
}
