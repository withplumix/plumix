// No `"use client"`: SSR replaces every export of such a module with an island
// shim, so a hook would return an element. Themes mark their own component.
import { useCallback, useState } from "react";
import { useSingleFlight } from "plumix/blocks/renderer";

import type { ResolvedComment } from "./server/load-thread.js";
import type { CommentFormOutcome } from "./thread-state.js";
import type { CommentFormError, CommentStatus } from "./types.js";
import { formAfterAnswer, threadPager, UNANSWERED } from "./thread-state.js";
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
  const [outcome, setOutcome] = useState<CommentFormOutcome>(UNANSWERED);
  const [submitting, setSubmitting] = useState(false);

  // Guarded, not left to `submitting`: a second press in the same tick reads
  // stale state and would insert two rows. Themes may not disable their
  // control.
  const submit = useSingleFlight(
    async (draft: CommentDraft): Promise<CommentStatus | null> => {
      setSubmitting(true);
      setOutcome(UNANSWERED);
      try {
        const answer = await postComment(submitAction(basePath), {
          entryId,
          ...draft,
        });
        const next = formAfterAnswer(answer);
        setOutcome(next);
        return next.status;
      } finally {
        setSubmitting(false);
      }
    },
  );

  const { errors, status } = outcome;
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
  // The pager, not the render, says which page is next: a press after a
  // page lands but before it renders must not ask for that page again.
  const [pager] = useState(() => threadPager(options.cursor));
  const [thread, setThread] = useState(() => pager.current());
  const [loading, setLoading] = useState(false);

  // Guarded: a second press in one tick would append one page twice.
  const load = useSingleFlight(async (): Promise<void> => {
    if (!pager.current().hasMore) return;
    setLoading(true);
    try {
      const next = await pager.next((cursor) =>
        fetchCommentPage(entryId, cursor, basePath),
      );
      if (next !== null) setThread(next);
    } finally {
      setLoading(false);
    }
  });
  const loadMore = useCallback(async (): Promise<void> => {
    await load();
  }, [load]);

  const { comments, hasMore, error } = thread;
  return { comments, hasMore, loading, error, loadMore };
}
