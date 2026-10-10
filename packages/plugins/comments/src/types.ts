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
 * `first_time` holds a new email's first comment and auto-approves once it has
 * an approved one.
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
  /** Maximum reply nesting depth (root = 0). Defaults to `3`. */
  readonly maxDepth?: number;
  /**
   * Root comments rendered per page (newest-first); older roots load
   * on demand via `GET /_plumix/comments/list`. Defaults to `20`.
   */
  readonly rootsPerPage?: number;
  /** Require a non-empty author email. Defaults to `true`. */
  readonly requireEmail?: boolean;
  /** Reject comments on posts older than this many days. `null` = never. */
  readonly closeAfterDays?: number | null;
  /**
   * Email a moderator when a comment is held for review. Requires a
   * configured `ctx.mailer`; with no address, no email is sent (the
   * in-app queue is the always-on surface).
   */
  readonly notifyEmail?: string;
  /** Sliding-window rate limit. Defaults to `{ max: 5, windowMin: 10 }`. */
  readonly rateLimit?: RateLimitConfig;
}

/**
 * A `field` of `""` is about the submission, not a control; the summary renders
 * it as text, not a link.
 */
export interface CommentFormError {
  readonly field: string;
  readonly message: string;
}

/** What the visitor typed, put back when they are handed the form again. */
export interface CommentFormValues {
  readonly name?: string;
  readonly email?: string;
  readonly body?: string;
}
