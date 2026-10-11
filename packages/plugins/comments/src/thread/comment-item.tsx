import type { ReactNode } from "react";

import type { ResolvedComment } from "../server/load-thread.js";

/** A theme's own rendering of one comment's body. */
export type CommentBodyRenderer = (comment: ResolvedComment) => ReactNode;

/**
 * `bodyHtml` is sanitized server-side (markdown-it with `html: false`), which
 * is what makes the raw sink safe.
 */
function DefaultBody({
  comment,
}: {
  readonly comment: ResolvedComment;
}): ReactNode {
  return (
    <div
      className="plumix-comment-body"
      dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
    />
  );
}

export function CommentItem({
  comment,
  renderBody,
}: {
  readonly comment: ResolvedComment;
  readonly renderBody?: CommentBodyRenderer;
}): ReactNode {
  const stamp = comment.createdAt.toISOString();
  return (
    <li
      className="plumix-comment"
      id={`comment-${String(comment.id)}`}
      data-plumix-comment={comment.id}
      data-plumix-comment-registered={comment.isRegistered ? "" : undefined}
    >
      <img
        className="plumix-comment-avatar"
        src={comment.avatarUrl}
        alt=""
        width={48}
        height={48}
        loading="lazy"
      />
      <span className="plumix-comment-author">{comment.authorName}</span>
      {/* The UTC date, so the server and an island render the same text. */}
      <time className="plumix-comment-date" dateTime={stamp}>
        {stamp.slice(0, 10)}
      </time>
      {renderBody ? renderBody(comment) : <DefaultBody comment={comment} />}
      {comment.replies.length > 0 ? (
        <ol className="plumix-comment-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              renderBody={renderBody}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}
