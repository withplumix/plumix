// Deliberately no `"use client"` directive, for the reason the note on
// `usePlumixForm` gives: the directive marks an *island*, and every export
// of a module carrying one is replaced by a server shim, so a hook shimmed
// into a component returns a React element instead of the state the caller
// asked for. The directive belongs on the theme's own component, which
// imports this and is the thing that hydrates.
import { useCallback, useState } from "react";
import * as v from "valibot";

import type { CommentFormError } from "./form/comment-form.js";

export type { CommentFormError } from "./form/comment-form.js";

/** What the endpoint answers a scripted caller with. */
export type CommentSubmitStatus = "approved" | "pending" | "spam" | "trash";

export interface CommentDraft {
  readonly name: string;
  readonly email?: string;
  readonly body: string;
  readonly parentId?: number | null;
}

/**
 * SPIKE P4 — what a theme rendering its own comment controls gets back.
 * Everything the form needs and nothing about how it looks: no markup, no
 * class names, the developer's own React is the whole of the form.
 *
 *     const { submit, errors, submitting, status } =
 *       usePlumixCommentForm({ entryId });
 *
 * Posts to the same endpoint the rendered form posts to, so a comment
 * submitted from a theme's own controls meets the honeypot, the rate
 * limit, the trust policy and the `comment:moderate` chain exactly as one
 * submitted from the plugin's markup does.
 */
export interface PlumixCommentFormState {
  /** Every refusal the last submit came back with. */
  readonly errors: readonly CommentFormError[];
  /** True from the moment a submit leaves until its answer lands. */
  readonly submitting: boolean;
  /** How the last accepted comment was filed, or null before one was. */
  readonly status: CommentSubmitStatus | null;
  errorFor(field: string): string | undefined;
  submit(draft: CommentDraft): Promise<CommentSubmitStatus | null>;
}

const CSRF_HEADER = "x-plumix-request";

// The endpoint answers one of two shapes; parsed rather than asserted, so
// a caller never reads a `status` off a body that did not carry one.
const submitResponseSchema = v.union([
  v.object({
    status: v.picklist(["approved", "pending", "spam", "trash"] as const),
  }),
  v.object({ error: v.string() }),
]);

export function usePlumixCommentForm(options: {
  readonly entryId: number;
  readonly basePath?: string;
}): PlumixCommentFormState {
  const [errors, setErrors] = useState<readonly CommentFormError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<CommentSubmitStatus | null>(null);
  const { entryId, basePath = "" } = options;

  const submit = useCallback(
    async (draft: CommentDraft): Promise<CommentSubmitStatus | null> => {
      setSubmitting(true);
      setErrors([]);
      try {
        const res = await fetch(`${basePath}/_plumix/comments/submit`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [CSRF_HEADER]: "1",
          },
          body: JSON.stringify({ entryId, ...draft }),
        });
        const parsed = v.safeParse(submitResponseSchema, await res.json());
        if (!parsed.success) {
          setErrors([{ field: "", message: "submit_failed" }]);
          return null;
        }
        const answer = parsed.output;
        if ("error" in answer) {
          setErrors([{ field: "", message: answer.error }]);
          return null;
        }
        setStatus(answer.status);
        return answer.status;
      } finally {
        setSubmitting(false);
      }
    },
    [entryId, basePath],
  );

  const errorFor = useCallback(
    (field: string) => errors.find((e) => e.field === field)?.message,
    [errors],
  );

  return { errors, submitting, status, errorFor, submit };
}
