import { inArray } from "drizzle-orm";
import * as v from "valibot";

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
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../validation.js";
import { entryCapability } from "./lifecycle.js";

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

export const revisionsRouter = { list, get } as const;
