import { inArray } from "drizzle-orm";
import * as v from "valibot";

import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { users } from "../../../db/schema/users.js";
import {
  getRevision as repoGetRevision,
  listRevisions as repoListRevisions,
  setRevisionMessage as repoSetRevisionMessage,
  upsertAutosave as repoUpsertAutosave,
} from "../../../revisions/repository.js";
import {
  decodeRevisionSlug,
  isReservedType,
} from "../../../revisions/slug-codec.js";
import {
  decodeRevisionMessage,
  decodeSnapshotEnvelope,
  REVISION_MESSAGE_MAX_LENGTH,
  SNAPSHOT_META_KEY,
} from "../../../revisions/snapshot-envelope.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../validation.js";
import { assertExpectedLiveUpdatedAt } from "./concurrency.js";
import {
  assertContentValidAgainstRegistries,
  assertContentWithinByteCap,
} from "./content.js";
import {
  applyEntryBeforeSave,
  entryCapability,
  fireEntryAutosaveSaved,
  fireEntryPublished,
  fireEntryRevisionRestored,
  fireEntryTransition,
  fireEntryUpdated,
  publishedAtForTransition,
} from "./lifecycle.js";

const listInput = v.object({
  entryId: idParam,
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
  ),
  // Cursor is an `id` as base-10 — 32 chars is generous (max safe
  // integer is 16) and bounds the input before `parseInt` rejects it.
  cursor: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(32)))),
});

const getInput = v.object({ revisionId: idParam });

const restoreInput = v.object({
  revisionId: idParam,
  expectedLiveUpdatedAt: v.optional(v.date()),
});

export const list = base
  .use(authenticated)
  .input(listInput)
  .handler(async ({ input, context, errors }) => {
    // Look the live entry up first so an unknown id returns NOT_FOUND
    // rather than leaking "you're missing this capability".
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, input.entryId),
    });
    if (!live) {
      throw errors.NOT_FOUND({
        data: { kind: "entry", id: input.entryId },
      });
    }
    if (isReservedType(live.type)) {
      throw errors.BAD_REQUEST({ data: { reason: "reserved_type" } });
    }
    const capability = entryCapability(live.type, "read_revisions");
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }
    const page = await repoListRevisions(context.db, {
      entryId: input.entryId,
      limit: input.limit ?? 25,
      cursor: input.cursor ?? null,
    });
    const authorIds = Array.from(
      new Set(page.revisions.map((r) => r.authorId)),
    );
    const authors =
      authorIds.length === 0
        ? []
        : await context.db.query.users.findMany({
            where: inArray(users.id, authorIds),
          });
    const authorById = new Map(authors.map((u) => [u.id, u]));
    const items = page.revisions.map((r) => {
      const author = authorById.get(r.authorId);
      return {
        id: r.id,
        title: r.title,
        updatedAt: r.updatedAt,
        authorId: r.authorId,
        authorName: author?.name ?? null,
        authorEmail: author?.email ?? null,
        message: decodeRevisionMessage(r.meta),
      };
    });
    return { revisions: items, nextCursor: page.nextCursor };
  });

export const get = base
  .use(authenticated)
  .input(getInput)
  .handler(async ({ input, context, errors }) => {
    const notFound = () =>
      errors.NOT_FOUND({ data: { kind: "revision", id: input.revisionId } });

    const revision = await repoGetRevision(context.db, {
      revisionId: input.revisionId,
    });
    if (!revision) throw notFound();

    // The revision row carries the reserved type; recover the live
    // entry's type from the slug to gate on its `read_revisions` cap.
    const decoded = decodeRevisionSlug(revision.slug);
    if (!decoded) throw notFound();
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, decoded.entryId),
    });
    if (!live || isReservedType(live.type)) throw notFound();

    const capability = entryCapability(live.type, "read_revisions");
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }
    // Join the author so the editor preview banner can show "by
    // <name>" without a second roundtrip. Matches the shape `list`
    // returns per row.
    const author = await context.db.query.users.findFirst({
      where: eq(users.id, revision.authorId),
    });
    return {
      ...revision,
      authorName: author?.name ?? null,
      authorEmail: author?.email ?? null,
      message: decodeRevisionMessage(revision.meta),
    };
  });

export const restore = base
  .use(authenticated)
  .input(restoreInput)
  .handler(async ({ input, context, errors }) => {
    const notFound = () =>
      errors.NOT_FOUND({ data: { kind: "revision", id: input.revisionId } });

    const revision = await repoGetRevision(context.db, {
      revisionId: input.revisionId,
    });
    if (!revision) throw notFound();

    const decoded = decodeRevisionSlug(revision.slug);
    if (!decoded) throw notFound();
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, decoded.entryId),
    });
    if (!live || isReservedType(live.type)) throw notFound();

    const readCapability = entryCapability(live.type, "read_revisions");
    if (!context.auth.can(readCapability)) {
      throw errors.FORBIDDEN({ data: { capability: readCapability } });
    }
    // Restore lands either on the caller's autosave row (for types
    // that opt into `supports: ['autosave']`) or the live row
    // directly (legacy types). `restore_revision` gates both — pair
    // it with `edit_*` so a viewer who can't edit the entry can't
    // restore on it either.
    const restoreCapability = entryCapability(live.type, "restore_revision");
    if (!context.auth.can(restoreCapability)) {
      throw errors.FORBIDDEN({ data: { capability: restoreCapability } });
    }
    const isAuthor = live.authorId === context.user.id;
    const editOwnCapability = entryCapability(live.type, "edit_own");
    const editAnyCapability = entryCapability(live.type, "edit_any");
    const canEdit =
      (isAuthor && context.auth.can(editOwnCapability)) ||
      context.auth.can(editAnyCapability);
    if (!canEdit) {
      throw errors.FORBIDDEN({ data: { capability: editAnyCapability } });
    }

    // Snapshots survive block deregistration — a block removed since
    // capture would render but never validate via `entry.update`. Run
    // the same gate so a stale revision can't land invalid content on
    // the destination row (autosave or live).
    assertContentWithinByteCap(revision.content, errors);
    assertContentValidAgainstRegistries(
      revision.content,
      { blocks: context.blocks },
      errors,
    );

    const typeSupportsAutosave =
      context.plugins.entryTypes
        .get(live.type)
        ?.supports?.includes("autosave") ?? false;

    // Autosave-supporting types: the restore lands on the caller's
    // per-user autosave row. No live concurrency token needed — the
    // user can publish (or discard) later via #290's flow.
    if (typeSupportsAutosave) {
      // Strip the snapshot envelope from the revision's meta bag
      // before the autosave write — `upsertAutosave` re-encodes its
      // own envelope from the live row's current slug + parentId.
      const cleanedMeta: Record<string, unknown> = { ...revision.meta };
      delete cleanedMeta[SNAPSHOT_META_KEY];
      const autosave = await repoUpsertAutosave(context.db, {
        entry: live,
        authorId: context.user.id,
        patch: {
          title: revision.title,
          content: revision.content,
          excerpt: revision.excerpt,
          meta: cleanedMeta,
        },
      });
      await fireEntryRevisionRestored(context, revision, autosave, live.type);
      await fireEntryAutosaveSaved(context, autosave, live);
      return autosave;
    }

    // Legacy live-write path for types without autosave support.
    // Preserves the pre-#290 behavior so existing callers don't break
    // — the autosave destination is the modern path and only kicks in
    // when the plugin explicitly opts in.
    assertExpectedLiveUpdatedAt(input.expectedLiveUpdatedAt, live.updatedAt, {
      stale: () => {
        throw errors.CONFLICT({
          data: { reason: "stale_expected_updated_at" },
        });
      },
    });

    const snapshotMeta: Record<string, unknown> = { ...revision.meta };
    const decodedEnvelope = decodeSnapshotEnvelope(snapshotMeta);
    delete snapshotMeta[SNAPSHOT_META_KEY];

    const isPublishTransition =
      revision.status === "published" && live.status !== "published";
    if (isPublishTransition) {
      const publishCapability = entryCapability(live.type, "publish");
      if (!context.auth.can(publishCapability)) {
        throw errors.FORBIDDEN({ data: { capability: publishCapability } });
      }
    }

    const patch: Partial<NewEntry> = {
      title: revision.title,
      slug: decodedEnvelope?.slug ?? live.slug,
      content: revision.content,
      excerpt: revision.excerpt,
      status: revision.status,
      parentId: decodedEnvelope?.parentId ?? live.parentId,
      meta: snapshotMeta,
    };
    if (isPublishTransition) {
      const stamped = publishedAtForTransition(live.publishedAt);
      if (stamped) patch.publishedAt = stamped;
    }

    const prepared = await applyEntryBeforeSave(context, live.type, {
      ...live,
      ...patch,
    });
    const toWrite: Partial<NewEntry> = {};
    for (const key of Object.keys(patch) as (keyof NewEntry)[]) {
      (toWrite as Record<string, unknown>)[key] = prepared[key];
    }

    const [updatedRow] = await context.db
      .update(entries)
      .set(toWrite)
      .where(eq(entries.id, live.id))
      .returning();
    if (!updatedRow) {
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }
    const updated: Entry = updatedRow;

    await fireEntryRevisionRestored(context, revision, updated, live.type);
    await fireEntryUpdated(context, updated, live);
    await fireEntryTransition(context, updated, live.status);
    if (isPublishTransition) {
      await fireEntryPublished(context, updated);
    }
    return updated;
  });

const setMessageInput = v.object({
  revisionId: idParam,
  // `null` clears the comment. Empty strings are coerced to null at
  // the repository layer; the API surface accepts both so the UI can
  // send whatever the input contains without a client-side trim
  // pass.
  message: v.union([
    v.null(),
    v.pipe(v.string(), v.maxLength(REVISION_MESSAGE_MAX_LENGTH)),
  ]),
});

// Patches `revision.message`. Capability gate deliberately matches
// `restore` (read_revisions + edit_own/edit_any) for symmetry — a
// user who can revert a revision can also re-caption it; future
// loosening (e.g. comment-only role) should change both gates in
// lockstep. No `expectedLiveUpdatedAt` token: comment edits don't
// touch the live entry, so concurrent label edits are
// last-write-wins on the same revision row.
export const setMessage = base
  .use(authenticated)
  .input(setMessageInput)
  .handler(async ({ input, context, errors }) => {
    const notFound = () =>
      errors.NOT_FOUND({ data: { kind: "revision", id: input.revisionId } });

    const revision = await repoGetRevision(context.db, {
      revisionId: input.revisionId,
    });
    if (!revision) throw notFound();

    const decoded = decodeRevisionSlug(revision.slug);
    if (!decoded) throw notFound();
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, decoded.entryId),
    });
    if (!live || isReservedType(live.type)) throw notFound();

    const readCapability = entryCapability(live.type, "read_revisions");
    if (!context.auth.can(readCapability)) {
      throw errors.FORBIDDEN({ data: { capability: readCapability } });
    }
    const isAuthor = live.authorId === context.user.id;
    const editOwnCapability = entryCapability(live.type, "edit_own");
    const editAnyCapability = entryCapability(live.type, "edit_any");
    const canEdit =
      (isAuthor && context.auth.can(editOwnCapability)) ||
      context.auth.can(editAnyCapability);
    if (!canEdit) {
      throw errors.FORBIDDEN({ data: { capability: editAnyCapability } });
    }

    // Normalize empty string to null at the input boundary so the
    // repository writes a canonical shape (delete-key vs set-key)
    // and the on-disk meta stays clean across re-edits.
    const normalized =
      input.message === null || input.message.length === 0
        ? null
        : input.message;
    const updated = await repoSetRevisionMessage(context.db, {
      revisionId: input.revisionId,
      message: normalized,
    });
    if (!updated) throw notFound();
    return { id: updated.id, message: decodeRevisionMessage(updated.meta) };
  });

export const revisionsRouter = { list, get, restore, setMessage } as const;
