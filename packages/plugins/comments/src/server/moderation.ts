import type { CommentStatus, ModerationMode } from "../types.js";
import { COMMENT_STATUSES } from "../types.js";

/**
 * The trust-policy baseline status for a new comment, before any
 * `comment:moderate` filters run. Logged-in commenters take a fast path
 * to `approved`; otherwise the mode decides (see {@link ModerationMode}).
 *
 * `first_time` trusts the prior-approved count for an *unverified* email
 * (WordPress's `comment_previously_approved` model): an anonymous author
 * who supplies a known-good address gets auto-approved. The moderation
 * queue and the `comment:moderate` chain (spam/AI plugins) are the
 * backstop; email verification is a future hardening.
 */
export function decideBaselineStatus(input: {
  readonly mode: ModerationMode;
  readonly priorApprovedCount: number;
  readonly isAuthenticated: boolean;
}): CommentStatus {
  if (input.isAuthenticated) return "approved";
  if (input.mode === "none") return "approved";
  if (input.mode === "all") return "pending";
  return input.priorApprovedCount > 0 ? "approved" : "pending";
}

// Higher rank = more restrictive. The `comment:moderate` chain may only
// push a comment toward the restrictive end, so detectors compose without
// caring about order: spam > trash > pending > approved.
const RANK: Record<CommentStatus, number> = {
  approved: 0,
  pending: 1,
  trash: 2,
  spam: 3,
};

function mostRestrictive(a: CommentStatus, b: CommentStatus): CommentStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

function isCommentStatus(value: unknown): value is CommentStatus {
  return (
    typeof value === "string" &&
    (COMMENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Fold a `comment:moderate` filter's verdict into the baseline. Filters
 * may only demote (most-restrictive wins, so order doesn't matter); a
 * verdict that isn't a known status is ignored rather than persisted —
 * a misbehaving filter can't corrupt the column or promote a comment.
 */
export function applyModerationVerdict(
  baseline: CommentStatus,
  verdict: unknown,
): CommentStatus {
  return isCommentStatus(verdict)
    ? mostRestrictive(baseline, verdict)
    : baseline;
}
