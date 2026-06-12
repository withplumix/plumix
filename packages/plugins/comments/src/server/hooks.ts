import type { Comment } from "../db/schema.js";
import type { CommentStatus } from "../types.js";

/**
 * What a `comment:moderate` filter sees about an incoming comment. Spam,
 * Akismet, or AI plugins read these signals and may only push the status
 * toward the restrictive end (the submit handler clamps via
 * `mostRestrictive`, so order between filters doesn't matter).
 */
export interface CommentModerationCandidate {
  readonly entryId: number;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly bodyMd: string;
  readonly ipHash: string;
  readonly isAuthenticated: boolean;
}

declare module "plumix/plugin" {
  interface FilterRegistry {
    "comment:moderate": (
      status: CommentStatus,
      candidate: CommentModerationCandidate,
    ) => CommentStatus | Promise<CommentStatus>;
  }
  interface ActionRegistry {
    "comment:created": (comment: Comment) => void | Promise<void>;
  }
}
