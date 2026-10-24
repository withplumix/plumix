import type { AppContext } from "plumix/plugin";
import { authenticated, base, requireCapability } from "plumix/plugin";
import * as v from "valibot";

import type { ModerationComment, StatusChange } from "./server/repository.js";
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

type TransitionAction = "comment:approved" | "comment:spam" | "comment:trashed";

/**
 * `restore` reuses the approved entry; `purge` is separate because it removes.
 */
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

/**
 * Visitors see only approved comments, so only a move into or out of
 * `approved` changes the entry's rendered thread.
 */
function threadChanged(context: AppContext, change: StatusChange): void {
  if (
    (change.previous === "approved") ===
    (change.comment.status === "approved")
  )
    return;
  context.cache.changed(change.comment.entryId);
}

export function createCommentsRouter() {
  const list = base
    .use(authenticated)
    .use(requireCapability(COMMENT_MODERATE_CAPABILITY))
    .input(
      v.object({
        status: v.picklist(COMMENT_STATUSES),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        entryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        search: v.optional(v.pipe(v.string(), v.maxLength(200))),
      }),
    )
    .handler(async ({ input, context }): Promise<ModerationCommentDTO[]> => {
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
    });

  const counts = base
    .use(authenticated)
    .use(requireCapability(COMMENT_MODERATE_CAPABILITY))
    .handler(async ({ context }): Promise<Record<CommentStatus, number>> => {
      return countByStatus(context);
    });

  // `restore` reuses the approved action — returning a comment to the queue
  // is re-approving it (no separate comment:restored action in v1).
  function transition(target: CommentStatus, action: TransitionAction) {
    return base
      .use(authenticated)
      .use(requireCapability(COMMENT_MODERATE_CAPABILITY))
      .input(idInput)
      .handler(
        async ({
          input,
          context,
          errors,
        }): Promise<{ status: CommentStatus }> => {
          const change = await setStatus(context, input.id, target);
          if (!change) {
            throw errors.NOT_FOUND({
              data: { kind: "comment", id: input.id },
            });
          }
          threadChanged(context, change);
          await context.hooks.doAction(action, change.comment, context);
          return { status: change.comment.status };
        },
      );
  }

  const purge = base
    .use(authenticated)
    .use(requireCapability(COMMENT_MODERATE_CAPABILITY))
    .input(idInput)
    .handler(
      async ({
        input,
        context,
      }): Promise<{ result: "tombstoned" | "deleted" | "missing" }> => {
        const outcome = await purgeComment(context, input.id);
        if (outcome.result !== "missing") {
          if (outcome.comment.status === "approved") {
            context.cache.changed(outcome.comment.entryId);
          }
          await context.hooks.doAction(
            "comment:deleted",
            outcome.comment,
            context,
          );
        }
        return { result: outcome.result };
      },
    );

  // Bulk transitions fire the lifecycle action per affected comment.
  const bulk = base
    .use(authenticated)
    .use(requireCapability(COMMENT_MODERATE_CAPABILITY))
    .input(
      v.object({
        ids: v.pipe(
          v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
          v.maxLength(200),
        ),
        action: v.picklist(BULK_ACTIONS),
      }),
    )
    .handler(async ({ input, context }): Promise<{ changed: number }> => {
      const { target, action } = TRANSITIONS[input.action];
      const changes = await setStatusMany(context, input.ids, target);
      for (const change of changes) {
        threadChanged(context, change);
        await context.hooks.doAction(action, change.comment, context);
      }
      return { changed: changes.length };
    });

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

/**
 * The admin chunk's wire contract, imported there with `import type` so this
 * module stays server-only.
 */
export type CommentsRouter = ReturnType<typeof createCommentsRouter>;
