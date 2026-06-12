import { useState } from "react";

import type {
  CommentStatus,
  ModerationAction,
  ModerationCommentDTO,
} from "./rpc.js";
import { useCommentCounts, useCommentList, useModeration } from "./rpc.js";

const TABS: readonly CommentStatus[] = ["pending", "approved", "spam", "trash"];

// Which actions each status tab offers. `purge` (hard remove) is always
// available; the rest move the comment between queues.
const ACTIONS: Record<CommentStatus, readonly ModerationAction[]> = {
  pending: ["approve", "spam", "trash", "purge"],
  approved: ["spam", "trash", "purge"],
  spam: ["approve", "trash", "purge"],
  trash: ["restore", "purge"],
};

export function CommentsShell(): React.ReactElement {
  const [tab, setTab] = useState<CommentStatus>("pending");
  const [selected, setSelected] = useState<ModerationCommentDTO | null>(null);
  const counts = useCommentCounts();
  const list = useCommentList(tab);
  const moderation = useModeration();

  return (
    <div data-testid="comments-shell">
      <div data-testid="comments-tabs" role="tablist">
        {TABS.map((status) => (
          <button
            key={status}
            type="button"
            data-testid={`comments-tab-${status}`}
            aria-pressed={tab === status}
            onClick={() => {
              setTab(status);
              setSelected(null);
            }}
          >
            {status}{" "}
            <span data-testid={`comments-count-${status}`}>
              {counts.data?.[status] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div data-testid="comments-loading" />
      ) : list.isError ? (
        <div data-testid="comments-error">Failed to load comments</div>
      ) : (list.data ?? []).length === 0 ? (
        <p data-testid="comments-empty">No {tab} comments</p>
      ) : (
        <table data-testid="comments-table">
          <tbody>
            {(list.data ?? []).map((comment) => (
              <tr key={comment.id} data-testid={`comment-row-${comment.id}`}>
                <td>
                  <button
                    type="button"
                    data-testid={`comment-open-${comment.id}`}
                    onClick={() => setSelected(comment)}
                  >
                    {comment.authorName}
                  </button>
                </td>
                <td data-testid={`comment-excerpt-${comment.id}`}>
                  {comment.bodyMd.slice(0, 80)}
                </td>
                <td>
                  {ACTIONS[tab].map((action) => (
                    <button
                      key={action}
                      type="button"
                      data-testid={`comment-${action}-${comment.id}`}
                      disabled={moderation.isPending}
                      onClick={() =>
                        moderation.mutate({ action, id: comment.id })
                      }
                    >
                      {action}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected ? (
        <aside data-testid="comment-detail">
          {/* Moderator sees the raw markdown source as text, not rendered HTML. */}
          <div data-testid="comment-detail-body">{selected.bodyMd}</div>
          <dl>
            <dt>Author</dt>
            <dd data-testid="comment-detail-author">{selected.authorName}</dd>
            <dt>Email</dt>
            <dd data-testid="comment-detail-email">{selected.authorEmail}</dd>
            <dt>Entry</dt>
            <dd data-testid="comment-detail-entry">{selected.entryId}</dd>
            <dt>IP hash</dt>
            <dd data-testid="comment-detail-ip">{selected.ipHash ?? "—"}</dd>
            <dt>Submitted</dt>
            <dd data-testid="comment-detail-date">{selected.createdAt}</dd>
          </dl>
        </aside>
      ) : null}
    </div>
  );
}
