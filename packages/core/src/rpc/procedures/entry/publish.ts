import type { JsonObject } from "../../../json.js";
import { entryCapabilityByName } from "../../../access/contract/entry-capabilities.js";
import { etagOf, ifMatchObject } from "../../../db/concurrency.js";
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
import {
  assertCopyCurrent,
  claimEntry,
  ENTRY_IF_MATCH_MESSAGE,
} from "./concurrency.js";
import {
  applyEntryBeforeSave,
  captureRevisionIfSupported,
  fireEntryTransition,
  fireEntryUpdated,
} from "./lifecycle.js";

const publishInput = ifMatchObject({ id: idParam }, ENTRY_IF_MATCH_MESSAGE);

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
    assertCopyCurrent(input.ifMatch, live.updatedAt);
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
    const updatedRow = await claimEntry(
      context.db,
      live.id,
      input.ifMatch,
      toWrite,
    );
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
    return { ...updatedRow, etag: etagOf(updatedRow.updatedAt) };
  });

function stripSnapshotEnvelope(meta: JsonObject): JsonObject {
  const next = { ...meta };
  delete next[SNAPSHOT_META_KEY];
  return next;
}
