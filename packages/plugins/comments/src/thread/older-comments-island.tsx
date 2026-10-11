"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { useIsLive } from "plumix/blocks/renderer";
import { labelSourceText } from "plumix/i18n";

import { usePlumixCommentThread } from "../hooks.js";
import { OLDER_COMMENTS } from "../messages.js";
import { CommentItem } from "./comment-item.js";

interface OlderCommentsProps {
  readonly entryId: number;
  readonly cursor: string;
  readonly olderHref: string;
}

/**
 * Until it hydrates the link navigates to the older page. A theme's
 * `renderBody` can't reach the browser, so appended comments use the default
 * body.
 */
export function OlderCommentsIsland({
  entryId,
  cursor,
  olderHref,
}: IslandProps<OlderCommentsProps>): ReactNode {
  const live = useIsLive();
  const thread = usePlumixCommentThread({ entryId, cursor });

  return (
    <div
      className="plumix-comment-older"
      data-plumix-comment-older-pages=""
      data-plumix-comment-live={live ? "" : undefined}
    >
      {thread.comments.length > 0 ? (
        <ol className="plumix-comment-list" data-plumix-comment-appended="">
          {thread.comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </ol>
      ) : null}
      {thread.error === null ? null : (
        <p className="plumix-comment-error" role="alert">
          {thread.error}
        </p>
      )}
      {thread.hasMore ? (
        <a
          className="plumix-comment-older-link"
          href={olderHref}
          data-plumix-comment-older=""
          aria-busy={thread.loading}
          onClick={(event) => {
            if (!live) return;
            event.preventDefault();
            void thread.loadMore();
          }}
        >
          {labelSourceText(OLDER_COMMENTS)}
        </a>
      ) : null}
    </div>
  );
}
