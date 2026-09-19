import type { AuthenticatedAppContext } from "../../../context/app.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import type { EntryEditErrors } from "../../../entries/editability.js";
import type { JsonValue } from "../../../json.js";
import type { ResolvedMeta } from "../../meta/core.js";
import { ACCESS_POLICY_META_KEY } from "../../../access/meta-key.js";
import { and, eq, isUniqueConstraintError, ne } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { entryCapabilityByName } from "../../../entries/capabilities.js";
import { assertCanEditEntry } from "../../../entries/editability.js";
import { loadReadableParent } from "../../../entries/visibility.js";
import {
  getAutosaveEdits,
  upsertAutosave,
} from "../../../revisions/repository.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import {
  asDraftRow,
  decodeSnapshotEnvelope,
  mergeAutosaveMeta,
  stripReservedMeta,
} from "../../../revisions/snapshot-envelope.js";
import { NAMED_TEMPLATE_META_KEY } from "../../../route/render/template-builders.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { isEmptyMetaPatch } from "../../meta/core.js";
import { assertExpectedLiveUpdatedAt } from "./concurrency.js";
import {
  assertContentValidAgainstRegistries,
  assertContentWithinByteCap,
} from "./content.js";
import {
  assertAccessChoiceDeclared,
  stripUndefined,
  withAccessChoice,
  withTemplateChoice,
} from "./helpers.js";
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
import {
  assertPromotedEntryMetaValid,
  loadEntryMeta,
  resolveEntryMeta,
  sanitizeAndValidateEntryMeta,
  writeEntryMeta,
} from "./meta.js";
import { scheduledDateInvalid } from "./publish-scheduled.js";
import { entryUpdateInputSchema } from "./schemas.js";
import {
  applyTermPatch,
  assertTermsPatchValid,
  buildTermsPatchGuards,
} from "./terms.js";

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
    assertContentValidAgainstRegistries(
      filtered.content,
      { blocks: context.blocks },
      errors,
    );

    const existing = await context.db.query.entries.findFirst({
      where: eq(entries.id, filtered.id),
    });
    // Reserved-type rows (revisions, autosaves) are written by the
    // framework's snapshot / draft paths, not `entry.update`. Surface
    // the same 404 a public row would emit so reserved-row existence
    // isn't observable.
    if (!existing || isReservedType(existing.type)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    assertCanEditEntry(context, existing, errors);

    // An editor may only select a per-entry access policy the type declares —
    // enforced here (before either the autosave or the live write folds it in)
    // so an undeclared key is rejected regardless of the save target.
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

    // Resolve `saveAs` against the entry's state + type capabilities.
    // The default keeps legacy callers writing to live unless the type
    // explicitly opts into autosave AND the row is currently published;
    // then a pending edit lands on a per-user autosave row instead.
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
      // The autosave accumulates the author's in-progress edits, so base each
      // write on the existing draft and apply only this patch on top — the
      // editor sends only what changed, so rebasing would drop keys an earlier
      // partial write changed. The base is the draft's own meta, never the live
      // row's: a key the author never touched must not ride into a bag that
      // publish re-decodes (ADR 0003).
      const currentEdits = await getAutosaveEdits(context.db, {
        entryId: existing.id,
        authorId: context.user.id,
      });
      // Autosave is draft-lenient: a work-in-progress save must never fail
      // over an empty required field or an out-of-bounds value the author
      // hasn't finished. Structural + security gates still run; the
      // business-rule constraints are re-enforced when `entry.publish`
      // promotes this bag in strict mode. The patch lands on the pending
      // draft, not on live, so that is the bag its conditions are judged
      // against.
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
      // Reserved envelope keys (snapshot, revision message) are re-derived by
      // `upsertAutosave`; drop them from the base, but keep the template and
      // access picks so a prior unsaved choice survives a write that doesn't
      // change it.
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
      // The framework's template and access picks fold in at patch level, the
      // same way the live branch takes them, so one loop applies every edit the
      // author made and a cleared key lands in `deletes` rather than merely
      // going missing.
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
          // Title is a live-only field: the editor writes it straight to the
          // live row (its structural path) and publish never promotes it, so
          // anchor the snapshot column to the current live title and ignore any
          // caller-supplied `title` on the draft branch — a drafted title would
          // be a write that publish silently drops. Content/excerpt/meta below
          // flow through the draft, so they accumulate on it.
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
      // The stored row carries only the edits, so lay them over live before
      // anything outside the write path sees it: a subscriber and a caller
      // both asked for the pending draft, which is a whole row.
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
    // A save that lands the entry as a draft is validated leniently:
    // work-in-progress must never fail over an empty required field or a
    // not-yet-valid value. Only a save that publishes or schedules the
    // entry enforces the full constraint set — the same gate `entry.publish`
    // applies when it promotes an autosave bag.
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

    // Entering the live surface (publishing or scheduling) enforces the full
    // resulting bag, not just this patch: a draft's meta was written
    // leniently, so a required field it left empty — or any value it never
    // re-touched — is caught here and blocks the transition. Editing an
    // already-live entry re-validates only its own patch and the fields that
    // patch switches visible (above), so pre-existing schema drift on a
    // co-author's field can't block an unrelated edit.
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

    // Scheduling: validate the target time only when actually (re)scheduling —
    // moving status to `scheduled` or supplying a new date. An incidental edit
    // to an already-scheduled entry (e.g. fixing a typo while it waits for the
    // cron, its date now in the past) must not be rejected. The supplied date
    // is written only while scheduling, so it can't backdate a published entry.
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

    // Nothing to write anywhere? Short-circuit without firing hooks, but
    // still return the current meta so callers get a consistent shape. An
    // empty meta map from the client (e.g. admin always sending `meta: {}`)
    // counts as no-op on the meta side too.
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
