import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import type { EntryEditErrors } from "../../../entries/editability.js";
import type { JsonObject, JsonValue } from "../../../json.js";
import type { ResolvedMeta } from "../../../meta/contract/bags.js";
import type { EntryUpdate, EntryWritten } from "./writes-shared.js";
import { entryCapabilityByName } from "../../../access/contract/entry-capabilities.js";
import { ACCESS_POLICY_META_KEY } from "../../../access/contract/meta-key.js";
import { etagOf } from "../../../db/concurrency.js";
import { isUniqueConstraintError } from "../../../db/index.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import {
  assertCanDeleteEntry,
  assertCanEditEntry,
} from "../../../entries/editability.js";
import {
  applyTermPatch,
  assertTermsPatchValid,
  buildTermsPatchGuards,
} from "../../../entries/terms.js";
import { loadReadableParent } from "../../../entries/visibility.js";
import { isEmptyMetaPatch, patchedMetaBag } from "../../../meta/core.js";
import {
  assertAccessChoiceDeclared,
  withAccessChoice,
  withTemplateChoice,
} from "../../../meta/entry-choices.js";
import {
  announceEntryMetaChange,
  assertPromotedEntryMetaValid,
  resolveEntryMeta,
  sanitizeAndValidateEntryMeta,
} from "../../../meta/entry.js";
import {
  getAutosaveEdits,
  upsertAutosave,
} from "../../../revisions/repository.js";
import {
  asDraftRow,
  decodeSnapshotEnvelope,
  mergeAutosaveMeta,
  stripReservedMeta,
} from "../../../revisions/snapshot-envelope.js";
import { NAMED_TEMPLATE_META_KEY } from "../../../route/render/template-builders.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { assertLeaseAllows } from "../../concurrency.js";
import { entryRows } from "./concurrency.js";
import {
  assertContentValidAgainstRegistries,
  assertContentWithinByteCap,
} from "./content.js";
import { stripUndefined } from "./helpers.js";
import {
  applyEntryBeforeSave,
  captureRevisionIfSupported,
  fireEntryAutosaveSaved,
  fireEntryPublished,
  fireEntryTransition,
  fireEntryUpdated,
  preparedColumns,
  publishedAtForTransition,
  wouldCreateParentCycle,
} from "./lifecycle.js";
import { scheduledDateInvalid } from "./publish-scheduled.js";
import { entryUpdateInputSchema } from "./schemas.js";
import { writeErrors as errors, withStoredMeta } from "./writes-shared.js";

interface ParentGuards {
  readonly notFound: (parentId: number) => never;
  readonly cycle: () => never;
}

interface GuardedWriteGuards {
  readonly slugTaken: () => never;
  readonly updateFailed: () => never;
}

function assertCanPublishTransition(
  context: AuthenticatedAppContext,
  existing: Entry,
  errors: EntryEditErrors,
): void {
  const publishCapability = entryCapabilityByName(
    context.plugins,
    existing.type,
    "publish",
  );
  if (!context.auth.can(publishCapability)) {
    throw errors.FORBIDDEN({ data: { capability: publishCapability } });
  }
}

/**
 * Undistinguished 404 so the parent's existence doesn't leak. Cycles of any
 * depth are rejected because the admin tree render infinite-loops on them.
 */
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

/**
 * The whole save as one guarded update: the columns after `before_save`, the
 * meta merged from the row the save read, and the token claimed from `ifMatch`.
 */
async function writeGuarded(
  context: AuthenticatedAppContext,
  existing: Entry,
  ifMatch: Date,
  patch: Partial<NewEntry>,
  meta: JsonObject | undefined,
  guards: GuardedWriteGuards,
): Promise<Entry> {
  let toWrite: Partial<NewEntry> = {};
  if (Object.keys(patch).length > 0) {
    const preparedFull = await applyEntryBeforeSave(context, existing.type, {
      ...existing,
      ...patch,
    });
    toWrite = preparedColumns(preparedFull, patch);
  }
  if (meta !== undefined) toWrite.meta = meta;

  let row;
  try {
    row = await entryRows(context.db).claimRow(existing.id, ifMatch, toWrite);
  } catch (error) {
    if (isUniqueConstraintError(error)) guards.slugTaken();
    throw error;
  }
  if (!row) guards.updateFailed();
  return row;
}

/**
 * Where a procedure checks capabilities inside the save: `edit` once the row is
 * loaded, `publish` or `trash` once the save is known to make that move.
 */
interface EntryUpdateGates {
  readonly edit?: (existing: Entry) => void;
  readonly publish?: (existing: Entry) => void;
  readonly trash?: (existing: Entry) => void;
}

/** `entry.update` and `ctx.entries.update`, each with its own gates. */
export async function updateEntry(
  context: AuthenticatedAppContext,
  filtered: EntryUpdate,
  gates: EntryUpdateGates = {},
): Promise<EntryWritten> {
  assertContentWithinByteCap(filtered.content, errors);

  const existing = await loadAuthoredEntry(context.db, filtered.id);
  if (!existing) {
    throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
  }

  gates.edit?.(existing);

  // A draft save bases on the draft's own edits, never live: the editor
  // sends only changes, and an untouched key must not ride into a bag
  // publish re-decodes.
  const currentEdits = await getAutosaveEdits(context.db, {
    entryId: existing.id,
    authorId: context.user.id,
  });
  // Validated against what the save starts from, so a block whose plugin is
  // gone survives the save while a new instance of it is refused.
  assertContentValidAgainstRegistries(
    filtered.content,
    [existing.content, currentEdits?.content],
    context,
    errors,
    {
      capability: entryCapabilityByName(
        context.plugins,
        existing.type,
        "edit_layout",
      ),
      from: [existing.content, currentEdits?.content],
    },
  );

  // Checked before either write path so an undeclared key is rejected
  // regardless of the save target.
  assertAccessChoiceDeclared(
    context.plugins.entryTypes.get(existing.type)?.access?.policies,
    filtered.access,
    errors,
  );

  // After auth, so an unauthorised caller with a stale copy still gets
  // FORBIDDEN, not CONFLICT or LOCKED.
  await assertLeaseAllows(
    context,
    { kind: "entry", id: existing.id },
    filtered.takeOver,
  );
  entryRows(context.db).assertCopyCurrent(filtered.ifMatch, existing);

  // Writes stay on live unless the type supports autosave AND the row is
  // published.
  const typeSupportsAutosave =
    context.plugins.entryTypes
      .get(existing.type)
      ?.supports?.includes("autosave") ?? false;
  const effectiveSaveAs: "draft" | "live" =
    filtered.saveAs ??
    (typeSupportsAutosave && existing.status === "published"
      ? "draft"
      : "live");
  if (effectiveSaveAs === "draft") {
    if (!typeSupportsAutosave) {
      throw errors.BAD_REQUEST({
        data: { reason: "autosave_unsupported" },
      });
    }
    if (existing.status !== "published") {
      // Drafts only make sense on a published row — the unpublished
      // row IS the draft. Caller should write to live directly.
      throw errors.BAD_REQUEST({
        data: { reason: "autosave_requires_published" },
      });
    }
    // Draft-lenient: a work-in-progress save never fails on business rules,
    // which `entry.publish` re-enforces. Conditions are judged against the
    // pending draft, not live.
    const autosaveMetaPatch = await sanitizeAndValidateEntryMeta(
      context,
      existing.type,
      filtered.meta,
      currentEdits
        ? mergeAutosaveMeta(existing.meta, currentEdits.meta)
        : existing.meta,
      errors,
      "draft",
    );
    // The columns snapshot where the meta bag patches, so these two still
    // fall back to the live row's values when the author left them alone.
    const columnBase = currentEdits ?? existing;
    // `upsertAutosave` re-derives the reserved envelope keys; the template
    // and access picks stay so a prior unsaved choice survives.
    const autosaveMeta: Record<string, JsonValue> = currentEdits
      ? stripReservedMeta(currentEdits.meta, [
          NAMED_TEMPLATE_META_KEY,
          ACCESS_POLICY_META_KEY,
        ])
      : {};
    // Absence means untouched, so a cleared key is carried rather than simply
    // dropped — and touching a key again un-clears it.
    const autosaveDeletes = new Set(
      currentEdits
        ? (decodeSnapshotEnvelope(currentEdits.meta)?.deletes ?? [])
        : [],
    );
    // Picks fold in at patch level, as on the live branch, so a cleared key
    // lands in `deletes` rather than going missing.
    const draftPatch = withAccessChoice(
      withTemplateChoice(autosaveMetaPatch, filtered.template),
      filtered.access,
    );
    for (const key of draftPatch?.deletes ?? []) {
      delete autosaveMeta[key];
      autosaveDeletes.add(key);
    }
    for (const [key, value] of draftPatch?.upserts ?? []) {
      autosaveMeta[key] = value;
      autosaveDeletes.delete(key);
    }
    const autosave = await upsertAutosave(context.db, {
      entry: existing,
      authorId: context.user.id,
      patch: {
        // Title is live-only and publish never promotes it, so a drafted
        // title would be silently dropped; the snapshot anchors to the live
        // title.
        title: existing.title,
        content:
          filtered.content !== undefined
            ? filtered.content
            : columnBase.content,
        excerpt:
          filtered.excerpt !== undefined
            ? filtered.excerpt
            : columnBase.excerpt,
        meta: autosaveMeta,
        metaDeletes: [...autosaveDeletes],
      },
    });
    // The stored row carries only the edits, so lay them over live before a
    // subscriber or caller sees it.
    const draft = asDraftRow(existing, autosave);
    await fireEntryAutosaveSaved(context, draft, existing);
    // Decode + resolve against the LIVE row's type — the autosave
    // row's own reserved type matches no registered meta fields.
    const decoded = await resolveEntryMeta(context, existing, draft.meta);
    // A draft save leaves live alone, so the copy's token still stands.
    return {
      entry: draft,
      meta: decoded,
      etag: etagOf(existing.updatedAt),
    };
  }

  const isPublishTransition =
    filtered.status === "published" && existing.status !== "published";
  const nowScheduled =
    filtered.status === "scheduled" && existing.status !== "scheduled";
  if (isPublishTransition || nowScheduled) {
    gates.publish?.(existing);
  }
  if (filtered.status === "trash" && existing.status !== "trash") {
    gates.trash?.(existing);
  }

  if (filtered.parentId != null && filtered.parentId !== existing.parentId) {
    await assertParentReassignmentValid(context, existing, filtered.parentId, {
      notFound: (parentId) => {
        throw errors.NOT_FOUND({ data: { kind: "entry", id: parentId } });
      },
      cycle: () => {
        throw errors.CONFLICT({ data: { reason: "parent_cycle" } });
      },
    });
  }

  // `terms`, `meta`, and `ifMatch` aren't entries.* columns
  // — split them out and validate up front so a bad taxonomy/cap/meta key
  // fails fast, before any write happens.
  const {
    id: _id,
    terms: termsPatch,
    meta: metaInput,
    template: templateChoice,
    access: accessChoice,
    ifMatch,
    saveAs: _saveAs,
    takeOver: _takeOver,
    publishedAt: publishedAtInput,
    storedMeta,
    ...changes
  } = filtered;
  // Drafts validate leniently; only publishing or scheduling enforces the
  // full constraint set, as `entry.publish` does.
  const targetStatus = filtered.status ?? existing.status;
  const metaMode =
    targetStatus === "published" || targetStatus === "scheduled"
      ? "strict"
      : "draft";
  let metaPatch = await sanitizeAndValidateEntryMeta(
    context,
    existing.type,
    metaInput,
    existing.meta,
    errors,
    metaMode,
  );
  // Fold the framework-owned template + access choices in after plugin-field
  // validation — they bypass the meta-box sanitizer by design.
  metaPatch = withTemplateChoice(metaPatch, templateChoice);
  metaPatch = withAccessChoice(metaPatch, accessChoice);
  metaPatch = withStoredMeta(metaPatch, storedMeta);
  if (termsPatch !== undefined) {
    await assertTermsPatchValid(
      context,
      termsPatch,
      buildTermsPatchGuards(errors),
    );
  }

  // Publishing or scheduling checks the whole bag, catching required fields a
  // lenient draft left empty. Editing a live entry checks only its patch, so
  // a co-author's drift can't block it.
  if (isPublishTransition || nowScheduled) {
    await assertPromotedEntryMetaValid(
      context,
      existing.type,
      patchedMetaBag(existing.meta, metaPatch),
      errors,
    );
  }

  const patch: Partial<NewEntry> = stripUndefined(changes);
  if (isPublishTransition) {
    const stamped = publishedAtForTransition(existing.publishedAt);
    if (stamped) patch.publishedAt = stamped;
  }

  // Only actually (re)scheduling validates the date: a typo fix on a scheduled
  // entry whose time has passed must still save, and the date can't backdate
  // a published entry.
  if (
    (filtered.status === "scheduled" || publishedAtInput !== undefined) &&
    (filtered.status ?? existing.status) === "scheduled"
  ) {
    const effective = publishedAtInput ?? existing.publishedAt ?? undefined;
    if (scheduledDateInvalid("scheduled", effective)) {
      throw errors.BAD_REQUEST({
        data: { reason: "scheduled_requires_future_date" },
      });
    }
    if (publishedAtInput !== undefined) {
      patch.publishedAt = publishedAtInput;
    }
  }

  // An empty `meta: {}` from the client counts as a no-op too.
  if (
    Object.keys(patch).length === 0 &&
    termsPatch === undefined &&
    isEmptyMetaPatch(metaPatch)
  ) {
    const meta = await resolveEntryMeta(context, existing, existing.meta);
    return { entry: existing, meta, etag: etagOf(existing.updatedAt) };
  }

  const metaChanged = !isEmptyMetaPatch(metaPatch);
  const updated = await writeGuarded(
    context,
    existing,
    ifMatch,
    patch,
    metaChanged ? patchedMetaBag(existing.meta, metaPatch) : undefined,
    {
      slugTaken: () => {
        throw errors.CONFLICT({ data: { reason: "slug_taken" } });
      },
      updateFailed: () => {
        throw errors.CONFLICT({ data: { reason: "update_failed" } });
      },
    },
  );

  // Only once the claim holds, so a refused save touches nothing else.
  if (termsPatch !== undefined) {
    await applyTermPatch(context, updated.id, termsPatch);
  }
  if (metaPatch && metaChanged) {
    await announceEntryMetaChange(context, updated, metaPatch);
  }
  const meta: ResolvedMeta = await resolveEntryMeta(
    context,
    updated,
    updated.meta,
  );

  if (Object.keys(patch).length > 0) {
    await fireEntryUpdated(context, updated, existing);
    await fireEntryTransition(context, updated, existing.status);
    if (isPublishTransition) {
      await fireEntryPublished(context, updated);
    }
    // Snapshot timing follows WP's `wp_save_post_revision`: after
    // the live write commits and after lifecycle hooks fire. No-op
    // when the type doesn't opt into `supports: ['revisions']`.
    await captureRevisionIfSupported(context, updated);
  }

  return { entry: updated, meta, etag: etagOf(updated.updatedAt) };
}

export const update = base
  .use(authenticated)
  .input(entryUpdateInputSchema)
  .handler(async ({ input, context }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.update:input",
      input,
    );
    const written = await updateEntry(context, filtered, {
      edit: (existing) => {
        assertCanEditEntry(context, existing, errors);
      },
      publish: (existing) => {
        assertCanPublishTransition(context, existing, errors);
      },
      trash: (existing) => {
        assertCanDeleteEntry(context, existing, errors);
      },
    });
    const output = await context.hooks.applyFilter("rpc:entry.update:output", {
      ...written.entry,
      meta: written.meta,
    });
    return { ...output, etag: written.etag };
  });
