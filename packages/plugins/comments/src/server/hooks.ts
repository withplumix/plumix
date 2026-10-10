import type { AppContext } from "plumix/plugin";

import type { Comment } from "../db/schema.js";
import type { CommentStatus } from "../types.js";

/**
 * A `comment:moderate` filter may only push status toward the restrictive end;
 * the handler clamps with `mostRestrictive`.
 */
export interface CommentModerationCandidate {
  readonly entryId: number;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly bodyMd: string;
  readonly ipHash: string;
  readonly isAuthenticated: boolean;
}

declare module "plumix" {
  interface FilterRegistry {
    "comment:moderate": (
      status: CommentStatus,
      candidate: CommentModerationCandidate,
    ) => CommentStatus | Promise<CommentStatus>;
  }
  interface ActionRegistry {
    "comment:created": (
      comment: Comment,
      ctx: AppContext,
    ) => void | Promise<void>;
    "comment:approved": (
      comment: Comment,
      ctx: AppContext,
    ) => void | Promise<void>;
    "comment:spam": (comment: Comment, ctx: AppContext) => void | Promise<void>;
    "comment:trashed": (
      comment: Comment,
      ctx: AppContext,
    ) => void | Promise<void>;
    /**
     * A moderator removed the comment, as a tombstone or outright. The
     * payload is the row as it stood before removal.
     */
    "comment:deleted": (
      comment: Comment,
      ctx: AppContext,
    ) => void | Promise<void>;
  }
}
