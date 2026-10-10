import type { ReactNode } from "react";
import { useBasePath, useIsEditing } from "plumix/blocks/renderer";
import { tryGetContext } from "plumix/plugin";

import { SUBMIT_PATH } from "./contract.js";
import { CommentIsland } from "./form/comment-island.js";
import { CommentMarkup } from "./form/comment-markup.js";
import { commentFormIdBase } from "./paths.js";

export type { CommentFormError, CommentFormValues } from "./types.js";

/**
 * Posts with no JavaScript and is upgraded in place by an island. A theme
 * wanting its own controls calls `usePlumixCommentForm` from
 * `@plumix/plugin-comments/hooks`.
 */
export function PlumixCommentForm({
  entryId,
  parentId = null,
  returnTo,
  id,
}: {
  readonly entryId: number;
  /** Set when this is the reply box under an existing comment. */
  readonly parentId?: number | null;
  /**
   * Defaults to the request's `Referer`; pass this where a referrer policy
   * strips it.
   */
  readonly returnTo?: string;
  /**
   * Seeds control ids, so two forms on one page need distinct values. Defaults
   * to the entry id.
   */
  readonly id?: string;
}): ReactNode {
  const basePath = useBasePath();
  const editing = useIsEditing();
  const config = tryGetContext()?.comments;
  // Without the plugin there is no endpoint for the form to post to.
  if (!config) return null;
  const form = {
    action: `${basePath}${SUBMIT_PATH}`,
    entryId,
    parentId,
    returnTo,
    idBase: commentFormIdBase(id ?? entryId),
    requireEmail: config.requireEmail,
  };
  // The canvas renders components directly, not through the island element, so
  // an island there would hijack submits while the form is being arranged.
  if (editing) return <CommentMarkup {...form} />;
  // `client="load"` because the form is often the reason the visitor
  // scrolled this far: it upgrades as soon as the chunk lands.
  return <CommentIsland client="load" {...form} />;
}
