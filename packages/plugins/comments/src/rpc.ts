import type { AppContext } from "plumix/plugin";
import { authenticated, base } from "plumix/plugin";
import * as v from "valibot";

import type { ModerationComment } from "./server/repository.js";
import type { CommentStatus } from "./types.js";
import {
  countByStatus,
  listForModeration,
  purgeComment,
  setStatus,
  setStatusMany,
} from "./server/repository.js";
import { COMMENT_STATUSES } from "./types.js";

export const COMMENT_MODERATE_CAPABILITY = "comment:moderate";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** A queue row over the wire — the repository shape with `createdAt`
 * serialized to an ISO string. */
export type ModerationCommentDTO = Omit<ModerationComment, "createdAt"> & {
  readonly createdAt: string;
};

interface ForbiddenErrors {
  readonly FORBIDDEN: (opts: { data: { capability: string } }) => Error;
}

function requireModerator(ctx: AppContext, errors: ForbiddenErrors): void {
  if (!ctx.auth.can(COMMENT_MODERATE_CAPABILITY)) {
    throw errors.FORBIDDEN({
      data: { capability: COMMENT_MODERATE_CAPABILITY },
    });
  }
}

type TransitionAction = "comment:approved" | "comment:spam" | "comment:trashed";

// Single source for the status transitions a moderator can drive (single
// or bulk): each maps to its target status + the lifecycle action it fires.
// `restore` reuses the approved entry; `purge` is separate (it removes).
const BULK_ACTIONS = ["approve", "spam", "trash"] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];
const TRANSITIONS: Record<
  BulkAction,
  { target: CommentStatus; action: TransitionAction }
> = {
  approve: { target: "approved", action: "comment:approved" },
  spam: { target: "spam", action: "comment:spam" },
  trash: { target: "trash", action: "comment:trashed" },
};

const idInput = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export function createCommentsRouter() {
  const list = base
    .use(authenticated)
    .input(
      v.object({
        status: v.picklist(COMMENT_STATUSES),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        entryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        search: v.optional(v.pipe(v.string(), v.maxLength(200))),
      }),
    )
    .handler(
      async ({ input, context, errors }): Promise<ModerationCommentDTO[]> => {
        requireModerator(context, errors);
        const rows = await listForModeration(context, {
          status: input.status,
          limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
          offset: input.offset ?? 0,
          entryId: input.entryId,
          search: input.search,
        });
        return rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        }));
      },
    );

  const counts = base
    .use(authenticated)
    .handler(
      async ({ context, errors }): Promise<Record<CommentStatus, number>> => {
        requireModerator(context, errors);
        return countByStatus(context);
      },
    );

  // `restore` reuses the approved action — returning a comment to the queue
  // is re-approving it (no separate comment:restored action in v1).
  function transition(target: CommentStatus, action: TransitionAction) {
    return base
      .use(authenticated)
      .input(idInput)
      .handler(
        async ({
          input,
          context,
          errors,
        }): Promise<{ status: CommentStatus }> => {
          requireModerator(context, errors);
          const row = await setStatus(context, input.id, target);
          if (!row) {
            throw errors.NOT_FOUND({
              data: { kind: "comment", id: input.id },
            });
          }
          await context.hooks.doAction(action, row);
          return { status: row.status };
        },
      );
  }

  const purge = base
    .use(authenticated)
    .input(idInput)
    .handler(
      async ({
        input,
        context,
        errors,
      }): Promise<{ result: "tombstoned" | "deleted" | "missing" }> => {
        requireModerator(context, errors);
        return { result: await purgeComment(context, input.id) };
      },
    );

  // Bulk transitions fire the lifecycle action per affected comment.
  const bulk = base
    .use(authenticated)
    .input(
      v.object({
        ids: v.pipe(
          v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
          v.maxLength(200),
        ),
        action: v.picklist(BULK_ACTIONS),
      }),
    )
    .handler(
      async ({ input, context, errors }): Promise<{ changed: number }> => {
        requireModerator(context, errors);
        const { target, action } = TRANSITIONS[input.action];
        const rows = await setStatusMany(context, input.ids, target);
        for (const row of rows) await context.hooks.doAction(action, row);
        return { changed: rows.length };
      },
    );

  return {
    list,
    counts,
    approve: transition(TRANSITIONS.approve.target, TRANSITIONS.approve.action),
    spam: transition(TRANSITIONS.spam.target, TRANSITIONS.spam.action),
    trash: transition(TRANSITIONS.trash.target, TRANSITIONS.trash.action),
    restore: transition(TRANSITIONS.approve.target, TRANSITIONS.approve.action),
    purge,
    bulk,
  };
}
