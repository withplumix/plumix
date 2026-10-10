import type { CommentStatus, ModerationMode } from "../types.js";
import { COMMENT_STATUSES } from "../types.js";

/**
 * `first_time` trusts prior approvals for an unverified email, as WordPress
 * does, so a known address auto-approves an anonymous author.
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
 * Filters may only demote; an unknown status is ignored, so a misbehaving
 * filter can't corrupt the column or promote a comment.
 */
export function applyModerationVerdict(
  baseline: CommentStatus,
  verdict: unknown,
): CommentStatus {
  return isCommentStatus(verdict)
    ? mostRestrictive(baseline, verdict)
    : baseline;
}
