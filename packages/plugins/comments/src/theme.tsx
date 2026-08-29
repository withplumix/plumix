import type { ReactNode } from "react";
import { useBasePath } from "plumix/blocks/renderer";

import { CommentForm } from "./form/comment-form.js";

export type { CommentFormError } from "./form/comment-form.js";

/**
 * SPIKE P4 — the comment form dropped straight into a theme template:
 *
 *     h(PlumixCommentForm, { entryId: data.entry.id })
 *
 * Server-rendered markup that posts to the plugin's own endpoint with no
 * JavaScript at all. The optional island upgrades it in place — same
 * markup, same endpoint — so what a visitor without JavaScript keeps is
 * the thing the enhancement builds on rather than a placeholder.
 *
 * Mirrors `PlumixForm` from `@plumix/plugin-forms/theme`, deliberately:
 * a theme author who has met one has met both.
 */
export function PlumixCommentForm({
  entryId,
  parentId = null,
  returnTo,
  requireEmail = true,
}: {
  readonly entryId: number;
  /** Set when rendering an inline reply box under a comment. */
  readonly parentId?: number | null;
  /** Where to send the browser back to. Defaults to the posting page. */
  readonly returnTo?: string;
  readonly requireEmail?: boolean;
}): ReactNode {
  const basePath = useBasePath();
  return (
    <CommentForm
      action={`${basePath}/_plumix/comments/submit`}
      entryId={entryId}
      parentId={parentId}
      returnTo={returnTo}
      requireEmail={requireEmail}
    />
  );
}
