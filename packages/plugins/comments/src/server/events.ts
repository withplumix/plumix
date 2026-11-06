import { defineEvent, defineFilter } from "plumix/plugin";

import type { Comment } from "../db/schema.js";
import type { CommentStatus } from "../types.js";

/** What a `comment.moderate` handler reads about the comment being submitted. */
export interface CommentModerationCandidate {
  readonly entryId: number;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly bodyMd: string;
  readonly ipHash: string;
  readonly isAuthenticated: boolean;
}

/** The comments plugin's events and filters, exported as `comment`. */
export const comment = {
  /**
   * The status a submitted comment is stored with. A handler may only push it
   * toward the restrictive end; the plugin clamps with `mostRestrictive`.
   */
  moderate: defineFilter<CommentStatus, CommentModerationCandidate>(
    "comment:moderate",
    { sync: false },
  ),
  /** A visitor's comment was stored, whatever status moderation gave it. */
  created: defineEvent<{ readonly comment: Comment }>("comment:created"),
  /** A moderator approved the comment, or restored it to the approved queue. */
  approved: defineEvent<{ readonly comment: Comment }>("comment:approved"),
  spam: defineEvent<{ readonly comment: Comment }>("comment:spam"),
  trashed: defineEvent<{ readonly comment: Comment }>("comment:trashed"),
  /**
   * A moderator removed the comment, as a tombstone or outright. `comment` is
   * the row as it stood before removal.
   */
  deleted: defineEvent<{ readonly comment: Comment }>("comment:deleted"),
};
