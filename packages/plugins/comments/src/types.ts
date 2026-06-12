/**
 * The four-state moderation lifecycle. `trash` is a recoverable
 * soft-delete; `spam` is retained for heuristics; hard removal is a
 * separate purge action (slice #963).
 */
export const COMMENT_STATUSES = [
  "pending",
  "approved",
  "spam",
  "trash",
] as const;

export type CommentStatus = (typeof COMMENT_STATUSES)[number];

/** Set-once configuration passed to `comments(options)` at include time. */
export interface CommentsConfig {
  /**
   * Entry types to enable comments on, beyond any that self-declare
   * `supports: ['comments']`. The WordPress `add_post_type_support`
   * analog for types whose registration you don't own.
   */
  readonly entryTypes?: readonly string[];
}
