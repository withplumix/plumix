"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { useIsLive } from "plumix/blocks/renderer";

import { usePlumixCommentThread } from "@plumix/plugin-comments/hooks";

import { commentItem } from "./comment-item.js";

/**
 * `createElement` rather than JSX keeps the playground transform-agnostic
 * across the jiti config load and the vite worker bundle.
 */
export function OlderComments({
  entryId,
  cursor,
}: IslandProps<{
  readonly entryId: number;
  readonly cursor: string | null;
}>): ReactNode {
  const thread = usePlumixCommentThread({ entryId, cursor });
  // Its server render is on the page before the island has hydrated, so
  // this marks the button as live for a visitor — and the e2e suite —
  // waiting on it.
  const live = useIsLive();

  return h(
    "div",
    { "data-testid": "comments-older", "data-live": live ? "" : undefined },
    h(
      "ul",
      { "data-testid": "comments-more" },
      thread.comments.map(commentItem),
    ),
    thread.hasMore
      ? h(
          "button",
          {
            "data-testid": "comments-load-more",
            type: "button",
            disabled: thread.loading,
            onClick: () => {
              void thread.loadMore();
            },
          },
          "Load more comments",
        )
      : null,
    thread.error === null
      ? null
      : h("p", { "data-testid": "comments-load-more-error" }, thread.error),
  );
}
