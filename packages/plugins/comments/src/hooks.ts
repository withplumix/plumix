// Deliberately no `"use client"` directive. The directive marks an
// *island* — a component the build gives its own chunk and a server-side
// shim that renders a `<plumix-island>` in its place — and every export of
// a module carrying one is replaced by that shim during the SSR pass. A
// hook shimmed into a component returns a React element, so the theme
// island calling it would render nothing it asked for. The directive
// belongs on the theme's own component, which imports this and is the
// thing that hydrates.
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

/**
 * What a theme rendering its own comment controls gets back. Everything
 * the form needs and nothing about how it looks: no markup, no stylesheet,
 * no class names — the developer's own React is the whole of the form.
 */
export interface PlumixCommentFormState {
  /**
   * Every refusal the last submit came back with. One naming no field is
   * about the submission rather than about an answer.
   */
  readonly errors: readonly CommentFormError[];
  /** True from the moment a submit leaves until its answer lands. */
  readonly submitting: boolean;
  /**
   * How the last accepted comment was filed, or null before one was. A
   * comment that is not `approved` is not in the thread yet, which is what
   * a theme says instead of leaving the visitor looking for it.
   */
  readonly status: CommentStatus | null;
  /**
   * One control's refusal, for rendering beside it. Pass `""` for the one
   * that names no field — what a comment that never reached the endpoint
   * comes back as.
   */
  errorFor(field: string): string | undefined;
  /**
   * Send the comment. It goes to the same endpoint the rendered form posts
   * to, so a comment submitted from a theme's own controls meets the
   * honeypot, the rate limit, the trust policy and the `comment:moderate`
   * chain exactly as one submitted from the plugin's markup does.
   */
  submit(draft: CommentDraft): Promise<CommentStatus | null>;
}

/**
 * A comment form, without the plugin's rendering of it.
 *
 *     const form = usePlumixCommentForm({ entryId: props.entryId });
 *
 * The honeypot is a field in markup this hook does not render, so a theme
 * driving its own controls is met by the rate limit and the trust policy
 * rather than by the trap — which is the trade of writing the markup
 * yourself, and the reason `PlumixCommentForm` exists.
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

  // A ref rather than the `submitting` state: a second press landing in
  // the same tick reads the state the first has not re-rendered yet, and
  // the cost of letting it through is two rows for one comment. A theme
  // is handed `submitting` to disable its own control with; nothing makes
  // it, so the guard is the hook's.
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

/**
 * What a theme loading older comments gets back: the comments, and
 * whether there are more. The markup is the theme's, and so is the first
 * page, which the `comments` template dep already rendered.
 */
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
 * The older root comments of a thread, without the rendering of them.
 *
 *     const thread = usePlumixCommentThread({
 *       entryId: props.entryId,
 *       cursor: props.cursor,
 *     });
 *
 * `cursor` is the `nextCursor` of the thread the template rendered, so
 * the first press loads the page after it. Every comment carries
 * `createdAt` as a `Date`, as it does server-side, so one item component
 * renders both.
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
