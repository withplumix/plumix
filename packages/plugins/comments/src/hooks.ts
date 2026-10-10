// No `"use client"`: SSR replaces every export of such a module with an island
// shim, so a hook would return an element. Themes mark their own component.
import { useCallback, useRef, useState } from "react";
import { labelSourceText } from "plumix/i18n";

import type { ResolvedComment } from "./server/load-thread.js";
import type { CommentFormError, CommentStatus } from "./types.js";
import { LOAD_FAILED } from "./messages.js";
import { REFUSALS } from "./refusals.js";
import { fetchCommentPage, postComment, submitAction } from "./wire.js";

export type { ResolvedComment } from "./server/load-thread.js";
export type { CommentFormError, CommentStatus } from "./types.js";

/** One comment, as a theme's own controls collect it. */
export interface CommentDraft {
  readonly name: string;
  readonly email?: string;
  readonly body: string;
  /** Set when the controls are a reply box under an existing comment. */
  readonly parentId?: number | null;
}

export interface PlumixCommentFormState {
  /**
   * Every refusal the last submit came back with. One naming no field is
   * about the submission rather than about an answer.
   */
  readonly errors: readonly CommentFormError[];
  /** True from the moment a submit leaves until its answer lands. */
  readonly submitting: boolean;
  /**
   * How the last accepted comment was filed, or null before one was. Anything
   * but `approved` isn't in the thread yet.
   */
  readonly status: CommentStatus | null;
  /**
   * One control's refusal, for rendering beside it. Pass `""` for the one
   * that names no field — what a comment that never reached the endpoint
   * comes back as.
   */
  errorFor(field: string): string | undefined;
  /**
   * Posts to the rendered form's endpoint, so the same rate limit, trust policy
   * and `comment:moderate` chain apply.
   */
  submit(draft: CommentDraft): Promise<CommentStatus | null>;
}

/**
 * The honeypot lives in markup this hook doesn't render, so a theme's own
 * controls are guarded only by the rate limit and trust policy.
 */
export function usePlumixCommentForm(options: {
  readonly entryId: number;
  /**
   * The subdirectory this deployment is mounted under. Read from the page
   * when omitted, which is right for a theme island on a public page.
   */
  readonly basePath?: string;
}): PlumixCommentFormState {
  const { entryId, basePath } = options;
  const [errors, setErrors] = useState<readonly CommentFormError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<CommentStatus | null>(null);

  // A ref, not `submitting` state: a second press in the same tick reads stale
  // state and would insert two rows. Themes may not disable their control.
  const inFlight = useRef(false);

  const submit = useCallback(
    async (draft: CommentDraft): Promise<CommentStatus | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setSubmitting(true);
      setErrors([]);
      // Cleared with the errors: a resubmit that fails must not leave
      // last time's status standing beside this time's refusals.
      setStatus(null);
      try {
        const answer = await postComment(submitAction(basePath), {
          entryId,
          ...draft,
        });
        if (!answer.ok) {
          setErrors(answer.errors);
          return null;
        }
        setStatus(answer.status);
        return answer.status;
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [entryId, basePath],
  );

  const errorFor = useCallback(
    (field: string): string | undefined =>
      errors.find((error) => error.field === field)?.message,
    [errors],
  );

  return { errors, submitting, status, errorFor, submit };
}

export interface PlumixCommentThreadState {
  /**
   * Every root comment this hook has loaded, oldest page last, each with
   * its replies. Empty until the first `loadMore` lands.
   */
  readonly comments: readonly ResolvedComment[];
  /** Whether a page older than the last one loaded is still there. */
  readonly hasMore: boolean;
  /** True from the moment a request leaves until its answer lands. */
  readonly loading: boolean;
  /** Why the last request came back empty-handed, or null. */
  readonly error: string | null;
  /**
   * Fetch the next older page and append it. A failed page is retried by
   * calling this again.
   */
  loadMore(): Promise<void>;
}

/**
 * `cursor` is the rendered thread's `nextCursor`. `createdAt` arrives as a
 * `Date`, as server-side, so one item component renders both.
 */
export function usePlumixCommentThread(options: {
  readonly entryId: number;
  /** The rendered thread's `nextCursor`; null when it had no more. */
  readonly cursor: string | null;
  /**
   * The subdirectory this deployment is mounted under. Read from the page
   * when omitted, which is right for a theme island on a public page.
   */
  readonly basePath?: string;
}): PlumixCommentThreadState {
  const { entryId, basePath } = options;
  const [comments, setComments] = useState<readonly ResolvedComment[]>([]);
  const [hasMore, setHasMore] = useState(options.cursor !== null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref because nothing renders it, and a retry after a failure must
  // ask for the page that failed rather than the one after it.
  const cursor = useRef(options.cursor);
  // The same guard `usePlumixCommentForm.submit` keeps, for the same
  // reason: a second press in one tick would append one page twice.
  const inFlight = useRef(false);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!hasMore || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const answer = await fetchCommentPage(entryId, cursor.current, basePath);
      if (!answer.ok) {
        setError(
          labelSourceText(
            answer.reason === "unreachable"
              ? LOAD_FAILED
              : REFUSALS[answer.reason].message,
          ),
        );
        return;
      }
      cursor.current = answer.nextCursor;
      setComments((loaded) => [...loaded, ...answer.comments]);
      setHasMore(answer.hasMore);
      setError(null);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [entryId, basePath, hasMore]);

  return { comments, hasMore, loading, error, loadMore };
}
