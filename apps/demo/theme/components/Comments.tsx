import * as React from "react";
import type { ReactNode } from "react";
import type {
  ResolvedComment,
  ResolvedThread,
} from "@plumix/plugin-comments/server";

interface CommentItemProps {
  readonly comment: ResolvedComment;
}

function CommentItem({ comment }: CommentItemProps): ReactNode {
  return (
    <li data-testid="comment">
      <div className="flex items-center gap-2">
        <img
          src={comment.avatarUrl}
          alt=""
          width={32}
          height={32}
          className="rounded-full"
        />
        <span className="text-sm font-medium">{comment.authorName}</span>
      </div>
      {/* bodyHtml is sanitized server-side (markdown-it, html:false). */}
      <div
        className="mt-2 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
      />
      {comment.replies.length > 0 ? (
        <ul className="mt-4 space-y-4 border-l border-line pl-4">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface CommentsProps {
  readonly thread: ResolvedThread | null;
}

export function Comments({ thread }: CommentsProps): ReactNode {
  // `loadThread` returns null for a post with no comments, so default to an
  // empty thread rather than hiding the section.
  const items = thread?.comments ?? [];
  const count = thread?.count ?? 0;
  const label = count === 1 ? "comment" : "comments";

  return (
    <section className="mt-16 border-t border-line pt-8" data-testid="comments">
      <h2 className="font-serif text-2xl">
        {count} {label}
      </h2>
      {items.length > 0 ? (
        <ul className="mt-6 space-y-6">
          {items.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-muted">No comments yet.</p>
      )}
    </section>
  );
}
