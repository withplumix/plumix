// Deliberately no `"use client"` directive. The directive marks an
// *island* — a component the build gives its own chunk and a server-side
// shim that renders a `<plumix-island>` in its place — and every export of
// a module carrying one is replaced by that shim during the SSR pass. A
// hook shimmed into a component returns a React element, so the theme
// island calling it would render nothing it asked for. The directive
// belongs on the theme's own component, which imports this and is the
// thing that hydrates.
import { useCallback, useRef, useState } from "react";

import type { CommentFormError, CommentStatus } from "./types.js";
import { postComment, submitAction } from "./wire.js";

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
