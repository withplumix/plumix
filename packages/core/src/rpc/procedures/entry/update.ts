import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import type { EntryEditErrors } from "../../../entries/editability.js";
import type { JsonValue } from "../../../json.js";
import type { ResolvedMeta } from "../../../meta/contract/bags.js";
import { entryCapabilityByName } from "../../../access/contract/entry-capabilities.js";
import { ACCESS_POLICY_META_KEY } from "../../../access/contract/meta-key.js";
import { and, eq, isUniqueConstraintError, ne } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import { assertCanEditEntry } from "../../../entries/editability.js";
import {
  applyTermPatch,
  assertTermsPatchValid,
  buildTermsPatchGuards,
} from "../../../entries/terms.js";
import { loadReadableParent } from "../../../entries/visibility.js";
import { isEmptyMetaPatch } from "../../../meta/core.js";
import {
  assertAccessChoiceDeclared,
  withAccessChoice,
  withTemplateChoice,
} from "../../../meta/entry-choices.js";
import {
  assertPromotedEntryMetaValid,
  loadEntryMeta,
  resolveEntryMeta,
  sanitizeAndValidateEntryMeta,
  writeEntryMeta,
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
import { assertExpectedLiveUpdatedAt } from "./concurrency.js";
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
  publishedAtForTransition,
  wouldCreateParentCycle,
} from "./lifecycle.js";
import { scheduledDateInvalid } from "./publish-scheduled.js";
import { entryUpdateInputSchema } from "./schemas.js";

interface ParentGuards {
  readonly notFound: (parentId: number) => never;
  readonly cycle: () => never;
}

interface ColumnWriteGuards {
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

// Undistinguished 404 so the parent's existence doesn't leak. Cycles of any
// depth are rejected because the admin tree render infinite-loops on them.
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
    assertContentValidAgainstRegistries(
      filtered.content,
      { blocks: context.blocks },
      errors,
    );

    const existing = await loadAuthoredEntry(context.db, filtered.id);
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    assertCanEditEntry(context, existing, errors);

    // Checked before either write path so an undeclared key is rejected
    // regardless of the save target.
    assertAccessChoiceDeclared(
      context.plugins.entryTypes.get(existing.type)?.access?.policies,
      filtered.access,
      errors,
    );

    // Optimistic-concurrency check sits after auth so an unauthorised
    // caller with a stale token still gets FORBIDDEN, not CONFLICT.
    assertExpectedLiveUpdatedAt(
      filtered.expectedLiveUpdatedAt,
      existing.updatedAt,
      {
        stale: () => {
          throw errors.CONFLICT({
            data: { reason: "stale_expected_updated_at" },
          });
        },
      },
    );

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
      // Base on the draft's own edits, never live: the editor sends only
      // changes, and a key the author never touched must not ride into a bag
      // publish re-decodes.
      const currentEdits = await getAutosaveEdits(context.db, {
        entryId: existing.id,
        authorId: context.user.id,
      });
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
      return context.hooks.applyFilter("rpc:entry.update:output", {
        ...draft,
        meta: decoded,
      });
    }

    const isPublishTransition =
      filtered.status === "published" && existing.status !== "published";
    if (isPublishTransition) {
      assertCanPublishTransition(context, existing, errors);
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

    // `terms`, `meta`, and `expectedLiveUpdatedAt` aren't entries.* columns
    // — split them out and validate up front so a bad taxonomy/cap/meta key
    // fails fast, before any write happens.
    const {
      id: _id,
      terms: termsPatch,
      meta: metaInput,
      template: templateChoice,
      access: accessChoice,
      expectedLiveUpdatedAt: _expectedLiveUpdatedAt,
      saveAs: _saveAs,
      publishedAt: publishedAtInput,
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
    const nowScheduled =
      filtered.status === "scheduled" && existing.status !== "scheduled";
    if (isPublishTransition || nowScheduled) {
      const resultingMeta: Record<string, JsonValue> = { ...existing.meta };
      if (metaPatch) {
        for (const [key, value] of metaPatch.upserts)
          resultingMeta[key] = value;
        for (const key of metaPatch.deletes) delete resultingMeta[key];
      }
      await assertPromotedEntryMetaValid(
        context,
        existing.type,
        resultingMeta,
        errors,
      );
    }

    const patch: Partial<NewEntry> = stripUndefined(changes);
    if (isPublishTransition) {
      const stamped = publishedAtForTransition(existing.publishedAt);
      if (stamped) patch.publishedAt = stamped;
    }

    // Publishing or scheduling checks the whole bag, catching required fields a
    // lenient draft left empty. A live edit checks only its patch, so a
    // co-author's drift can't block it.
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
    let meta: ResolvedMeta;
    if (metaPatch) {
      await writeEntryMeta(context, updated, metaPatch);
      meta = await loadEntryMeta(context, updated);
    } else {
      meta = await resolveEntryMeta(context, updated, updated.meta);
    }

    if (postColumnsWritten) {
      await fireEntryUpdated(context, updated, existing);
      await fireEntryTransition(context, updated, existing.status);
      if (isPublishTransition) {
        await fireEntryPublished(context, updated);
      }
      // Snapshot timing mirrors WP's `wp_save_post_revision`: after
      // the live write commits and after lifecycle hooks fire. No-op
      // when the type doesn't opt into `supports: ['revisions']`.
      await captureRevisionIfSupported(context, updated);
    }

    return context.hooks.applyFilter("rpc:entry.update:output", {
      ...updated,
      meta,
    });
  });
