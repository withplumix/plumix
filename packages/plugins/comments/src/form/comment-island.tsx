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

// A held comment isn't in the thread yet, so "posted" would read as lost.
// Spam and trash get the held message: the filing isn't the sender's to learn.
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
 * Can say a comment was held, which the no-JavaScript path cannot: a redirect
 * carries no state, and an outcome in the URL would fork the edge-cache entry.
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

  // A ref, not `busy` state: a second press in the same tick reads stale state
  // and would insert two rows.
  const inFlight = useRef(false);

  // Focus follows the outcome for screen readers. Every failure sets a fresh
  // array, so a repeat failure moves focus again.
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
        // The handler attaches a frame before hydration finishes; a submit
        // caught then is one the plain form can make.
        if (!live) return;
        event.preventDefault();
        void submit(event.currentTarget);
      }}
      summaryRef={summary}
    />
  );
}
