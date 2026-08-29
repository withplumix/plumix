"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useIsLive } from "plumix/blocks/renderer";
import { labelSourceText } from "plumix/i18n";

import type {
  CommentFormError,
  CommentFormValues,
  CommentStatus,
} from "../types.js";
import { HELD, POSTED } from "../messages.js";
import { postComment } from "../wire.js";
import { CommentMarkup } from "./comment-markup.js";

interface CommentIslandProps {
  readonly action: string;
  readonly entryId: number;
  readonly parentId: number | null;
  readonly returnTo: string | undefined;
  readonly idBase: string;
  readonly requireEmail: boolean;
}

// A held comment is not in the thread when the visitor looks for it, so
// saying only "posted" would read as having lost it. `spam` and `trash`
// are told the same thing an approved-but-held comment is: which of them
// a submission was filed as is not the sender's to learn.
const confirmationFor = (status: CommentStatus): string =>
  labelSourceText(status === "approved" ? POSTED : HELD);

const readValues = (form: HTMLFormElement): CommentFormValues => {
  const data = new FormData(form);
  // A `FormData` entry is a string or a file, and this form has no file
  // control — so anything else is not an answer to send.
  const text = (key: string): string => {
    const value = data.get(key);
    return typeof value === "string" ? value : "";
  };
  return { name: text("name"), email: text("email"), body: text("body") };
};

/**
 * The comment form, upgraded: a submit that does not leave the page,
 * refusals rendered against the controls that produced them, and an
 * answer that can say a comment was held for review — which the
 * no-JavaScript path cannot, because a redirect carries no state and
 * putting the outcome in the URL would fork the page's edge-cache entry
 * per outcome.
 *
 * It renders the same {@link CommentMarkup} the server already sent, so what
 * a visitor without JavaScript keeps working with is the thing this builds
 * on rather than a placeholder it replaces.
 */
export function CommentIsland({
  action,
  entryId,
  parentId,
  returnTo,
  idBase,
  requireEmail,
}: IslandProps<CommentIslandProps>): ReactNode {
  const live = useIsLive();
  const [errors, setErrors] = useState<readonly CommentFormError[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const confirmed = useRef<HTMLDivElement>(null);

  // A ref rather than the `busy` state: a second press landing in the same
  // tick reads the state the first has not re-rendered yet, and the cost
  // of letting it through is two rows for one comment.
  const inFlight = useRef(false);

  // Focus follows the outcome, so a visitor who cannot see the page is
  // told what happened instead of being left at a button that appeared to
  // do nothing. Every failure sets a fresh array, so a second submit
  // failing the same way moves focus again.
  useEffect(() => {
    if (errors.length > 0) summary.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (confirmation !== null) confirmed.current?.focus();
  }, [confirmation]);

  async function submit(form: HTMLFormElement): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const answer = await postComment(action, {
        entryId,
        parentId,
        ...readValues(form),
      });
      if (answer.ok) {
        setErrors([]);
        setConfirmation(confirmationFor(answer.status));
        return;
      }
      setErrors(answer.errors);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (confirmation !== null) {
    return (
      <div
        className="plumix-comment-confirmation"
        data-plumix-comment-confirmation=""
        role="status"
        tabIndex={-1}
        ref={confirmed}
      >
        {confirmation}
      </div>
    );
  }

  return (
    <CommentMarkup
      action={action}
      entryId={entryId}
      parentId={parentId}
      returnTo={returnTo}
      idBase={idBase}
      requireEmail={requireEmail}
      errors={errors}
      enhanced={live}
      busy={busy}
      onSubmit={(event) => {
        // Only once the island is live. The handler is attached from the
        // first client render, a frame before hydration has finished, and
        // a submit caught there is one the plain form could have made.
        if (!live) return;
        event.preventDefault();
        void submit(event.currentTarget);
      }}
      summaryRef={summary}
    />
  );
}
