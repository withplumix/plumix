import type { ReactNode } from "react";
import { useBasePath, useIsEditing } from "plumix/blocks/renderer";

import { SUBMIT_PATH } from "./contract.js";
import { CommentIsland } from "./form/comment-island.js";
import { CommentMarkup } from "./form/comment-markup.js";
import { commentFormIdBase } from "./paths.js";
import { publishedCommentsConfig } from "./registry.js";

export type { CommentFormError, CommentFormValues } from "./types.js";

/**
 * The comment form, dropped straight into a theme template:
 *
 *     h(PlumixCommentForm, { entryId: data.entry.id })
 *
 * Server-rendered markup that posts to the plugin's own endpoint with no
 * JavaScript at all, upgraded in place by an island where there is some.
 * A refused comment comes back as this same form with the visitor's words
 * still in it, which is the whole reason the plugin renders markup rather
 * than leaving it to the theme.
 *
 * A theme that wants its own controls writes them and calls
 * `usePlumixCommentForm` from `@plumix/plugin-comments/hooks` instead —
 * `loadThread` and a hand-written form stay fully supported.
 *
 * Mirrors `PlumixForm` from `@plumix/plugin-forms/theme`, deliberately: a
 * theme author who has met one has met both.
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
   * Where to send the browser once the comment is in. The endpoint falls
   * back to the request's `Referer`, which is the post in the ordinary
   * case; pass this where a referrer policy strips it, or to land the
   * visitor on the thread rather than the top of the page.
   */
  readonly returnTo?: string;
  /**
   * What tells two forms on one page apart — the thread's own box and a
   * reply box under a comment. Control ids are built from it, and a label
   * points at its control by id, so without one each the second form's
   * labels address the first form's controls. Defaults to the entry id,
   * which is enough for the one form a template usually renders.
   */
  readonly id?: string;
}): ReactNode {
  const basePath = useBasePath();
  const editing = useIsEditing();
  const { requireEmail } = publishedCommentsConfig();
  const form = {
    action: `${basePath}${SUBMIT_PATH}`,
    entryId,
    parentId,
    returnTo,
    idBase: commentFormIdBase(id ?? entryId),
    requireEmail,
  };
  // In the visual editor the form is a thing being arranged rather than
  // filled in, so it stays as the markup — the same rule the islands
  // runtime applies to an island on a page it is editing. The canvas
  // renders components directly rather than through the island element,
  // so without this the island would run there and take over a submit
  // nobody meant to make.
  if (editing) return <CommentMarkup {...form} />;
  // `client="load"` because the form is often the reason the visitor
  // scrolled this far: it upgrades as soon as the chunk lands.
  return <CommentIsland client="load" {...form} />;
}
