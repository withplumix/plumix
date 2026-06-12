import { useState } from "react";

import type {
  BulkAction,
  CommentStatus,
  ModerationAction,
  ModerationCommentDTO,
} from "./rpc.js";
import {
  BULK_ACTIONS,
  useBulkModeration,
  useCommentCounts,
  useCommentList,
  useModeration,
} from "./rpc.js";

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
  const [search, setSearch] = useState("");
  const [entryFilter, setEntryFilter] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const counts = useCommentCounts();
  const entryId = Number.parseInt(entryFilter, 10);
  const list = useCommentList(tab, {
    search: search.trim() || undefined,
    entryId: Number.isFinite(entryId) ? entryId : undefined,
  });
  const moderation = useModeration();
  const bulk = useBulkModeration();

  function reset(next: CommentStatus): void {
    setTab(next);
    setSelected(null);
    setPicked(new Set());
  }

  function togglePicked(id: number): void {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulk(action: BulkAction): void {
    bulk.mutate(
      { action, ids: [...picked] },
      { onSuccess: () => setPicked(new Set()) },
    );
  }

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
              reset(status);
            }}
          >
            {status}{" "}
            <span data-testid={`comments-count-${status}`}>
              {counts.data?.[status] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div data-testid="comments-filters">
        <input
          type="search"
          data-testid="comments-search"
          aria-label="Search comments"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          type="number"
          data-testid="comments-entry-filter"
          aria-label="Filter by entry id"
          value={entryFilter}
          onChange={(event) => setEntryFilter(event.target.value)}
        />
      </div>

      {picked.size > 0 ? (
        <div data-testid="comments-bulk-bar">
          <span data-testid="comments-bulk-count">{picked.size}</span>
          {BULK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              data-testid={`comments-bulk-${action}`}
              disabled={bulk.isPending}
              onClick={() => runBulk(action)}
            >
              {action}
            </button>
          ))}
        </div>
      ) : null}

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
                  <input
                    type="checkbox"
                    data-testid={`comment-select-${comment.id}`}
                    aria-label={`Select comment ${String(comment.id)}`}
                    checked={picked.has(comment.id)}
                    onChange={() => togglePicked(comment.id)}
                  />
                </td>
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
