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

/**
 * Trust policy for a new comment:
 * - `all` — always hold for moderation.
 * - `first_time` — hold a new email's first comment; auto-approve once it
 *   has a prior approved comment (WordPress `comment_previously_approved`).
 * - `none` — auto-approve everything.
 */
export type ModerationMode = "all" | "first_time" | "none";

/** Per-source rate limit for public submissions. */
export interface RateLimitConfig {
  readonly max: number;
  readonly windowMin: number;
}

/** Set-once configuration passed to `comments(options)` at include time. */
export interface CommentsConfig {
  /**
   * Entry types to enable comments on, beyond any that self-declare
   * `supports: ['comments']`. The WordPress `add_post_type_support`
   * analog for types whose registration you don't own.
   */
  readonly entryTypes?: readonly string[];
  /** Trust policy. Defaults to `"first_time"`. */
  readonly mode?: ModerationMode;
  /** Require a non-empty author email. Defaults to `true`. */
  readonly requireEmail?: boolean;
  /** Reject comments on posts older than this many days. `null` = never. */
  readonly closeAfterDays?: number | null;
  /** Sliding-window rate limit. Defaults to `{ max: 5, windowMin: 10 }`. */
  readonly rateLimit?: RateLimitConfig;
}
