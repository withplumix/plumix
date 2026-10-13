import { labelSourceText } from "plumix/i18n";

import type { CommentRefusalCode } from "./refusals.js";
import type { ResolvedComment } from "./server/load-thread.js";
import type { CommentFormError, CommentStatus } from "./types.js";
import type { CommentAnswer, CommentPageAnswer } from "./wire.js";
import { LOAD_FAILED } from "./messages.js";
import { REFUSALS } from "./refusals.js";

/** What a theme's comment controls show after a submit. */
export interface CommentFormOutcome {
  readonly errors: readonly CommentFormError[];
  readonly status: CommentStatus | null;
}

export const UNANSWERED: CommentFormOutcome = { errors: [], status: null };

/**
 * A refusal takes the last status away: a theme that keeps its controls
 * mounted must not show last time's outcome beside this time's refusals.
 */
export function formAfterAnswer(answer: CommentAnswer): CommentFormOutcome {
  return answer.ok
    ? { errors: [], status: answer.status }
    : { errors: answer.errors, status: null };
}

/** The older comments a theme has loaded below the rendered thread. */
export interface CommentThreadState {
  readonly comments: readonly ResolvedComment[];
  readonly hasMore: boolean;
  /** The page to ask for next; a failure keeps it, so a retry asks again. */
  readonly cursor: string | null;
  readonly error: string | null;
}

/** `cursor` is the rendered thread's `nextCursor`; null when it had no more. */
export function openThread(cursor: string | null): CommentThreadState {
  return { comments: [], hasMore: cursor !== null, cursor, error: null };
}

export function applyCommentPage(
  state: CommentThreadState,
  answer: CommentPageAnswer,
): CommentThreadState {
  if (!answer.ok) return { ...state, error: threadError(answer.reason) };
  return {
    comments: [...state.comments, ...answer.comments],
    hasMore: answer.hasMore,
    cursor: answer.nextCursor,
    error: null,
  };
}

/** Why a page of older comments came back empty-handed. */
export function threadError(
  reason: CommentRefusalCode | "unreachable",
): string {
  return labelSourceText(
    reason === "unreachable" ? LOAD_FAILED : REFUSALS[reason].message,
  );
}
