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
      }),
    )
    .handler(
      async ({ input, context, errors }): Promise<ModerationCommentDTO[]> => {
        requireModerator(context, errors);
        const rows = await listForModeration(context, {
          status: input.status,
          limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
          offset: input.offset ?? 0,
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

  return {
    list,
    counts,
    approve: transition("approved", "comment:approved"),
    spam: transition("spam", "comment:spam"),
    trash: transition("trash", "comment:trashed"),
    restore: transition("approved", "comment:approved"),
    purge,
  };
}
