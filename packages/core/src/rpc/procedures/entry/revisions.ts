import { inArray } from "drizzle-orm";
import * as v from "valibot";

import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { users } from "../../../db/schema/users.js";
import {
  getRevision as repoGetRevision,
  listRevisions as repoListRevisions,
} from "../../../revisions/repository.js";
import {
  decodeRevisionSlug,
  isRevisionType,
} from "../../../revisions/slug-codec.js";
import {
  decodeSnapshotEnvelope,
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
  fireEntryPublished,
  fireEntryTransition,
  fireEntryUpdated,
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
    if (isRevisionType(live.type)) {
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
    if (!live || isRevisionType(live.type)) throw notFound();

    const capability = entryCapability(live.type, "read_revisions");
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }
    return revision;
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
    if (!live || isRevisionType(live.type)) throw notFound();

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

    assertExpectedLiveUpdatedAt(input.expectedLiveUpdatedAt, live.updatedAt, {
      stale: () => {
        throw errors.CONFLICT({
          data: { reason: "stale_expected_updated_at" },
        });
      },
    });

    // Snapshot's `meta` carries the framework `__plumix_snapshot`
    // envelope plus whatever the live entry's meta bag held at capture
    // time. The envelope is internal — strip before writing back.
    const snapshotMeta: Record<string, unknown> = { ...revision.meta };
    const decodedEnvelope = decodeSnapshotEnvelope(snapshotMeta);
    delete snapshotMeta[SNAPSHOT_META_KEY];

    // Snapshots survive block deregistration — a block removed since
    // capture would render but never validate via `entry.update`. Run
    // the same gate so a stale revision can't land invalid content on
    // the live row.
    assertContentWithinByteCap(revision.content, errors);
    assertContentValidAgainstRegistries(
      revision.content,
      { blocks: context.blocks, marks: context.marks },
      errors,
    );

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
    if (isPublishTransition && !live.publishedAt) {
      patch.publishedAt = new Date();
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

    await fireEntryUpdated(context, updated, live);
    await fireEntryTransition(context, updated, live.status);
    if (isPublishTransition) {
      await fireEntryPublished(context, updated);
    }
    // WordPress's `wp_restore_post_revision` does not snapshot the
    // post-restore state: the restored revision row already records
    // the new live content, so writing another duplicate row would
    // burn one slot of `versioning.maxRevisions` per restore for no
    // history value. Audit attribution belongs in the audit-log
    // plugin via a dedicated hook in a later slice.
    return updated;
  });

export const revisionsRouter = { list, get, restore } as const;
