import type { MessageDescriptor } from "plumix/i18n";
import { useState } from "react";
import { Button, Checkbox, Input } from "plumix/admin/ui";
import { Trans, useLingui } from "plumix/i18n";

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

// Status/action labels are looked up dynamically (tab + button maps), so
// they can't be authored as inline `<Trans>` JSX; they live here as
// explicit-id descriptors and render through `i18n._`. `status.spam` and
// `action.spam` are deliberately distinct ids — one names a queue, the
// other an operation, and a locale may translate them differently.
const STATUS_LABELS = {
  pending: { id: "plugin.comments.status.pending", message: "Pending" },
  approved: { id: "plugin.comments.status.approved", message: "Approved" },
  spam: { id: "plugin.comments.status.spam", message: "Spam" },
  trash: { id: "plugin.comments.status.trash", message: "Trash" },
} satisfies Record<CommentStatus, MessageDescriptor>;

const ACTION_LABELS = {
  approve: { id: "plugin.comments.action.approve", message: "Approve" },
  spam: { id: "plugin.comments.action.spam", message: "Spam" },
  trash: { id: "plugin.comments.action.trash", message: "Trash" },
  restore: { id: "plugin.comments.action.restore", message: "Restore" },
  purge: {
    id: "plugin.comments.action.purge",
    message: "Delete permanently",
  },
} satisfies Record<ModerationAction, MessageDescriptor>;

// Approve/restore move a comment into a queue; everything else (spam,
// trash, purge) is destructive and gets a red tint. `hover:text-destructive`
// is explicit because the ghost Button variant otherwise recolors text on
// hover. Shared by the bulk bar and the per-row actions so the two can't
// drift on which actions count as destructive.
const DESTRUCTIVE_ACTION_CLASS = "text-destructive hover:text-destructive";
function isDestructiveAction(action: string): boolean {
  return action !== "approve" && action !== "restore";
}

// Descriptors used outside JSX (input attributes, interpolated aria-label).
const M = {
  heading: {
    id: "plugin.comments.heading",
    message: "Comments",
  },
  searchLabel: {
    id: "plugin.comments.filter.searchLabel",
    message: "Search comments",
  },
  searchPlaceholder: {
    id: "plugin.comments.filter.searchPlaceholder",
    message: "Search comments…",
  },
  entryLabel: {
    id: "plugin.comments.filter.entryLabel",
    message: "Filter by entry id",
  },
  entryPlaceholder: {
    id: "plugin.comments.filter.entryPlaceholder",
    message: "Entry id…",
  },
  selectLabel: {
    id: "plugin.comments.row.selectLabel",
    message: "Select comment {id}",
    comment: "id: the numeric id of the comment row",
  },
} satisfies Record<string, MessageDescriptor>;

export function CommentsShell(): React.ReactElement {
  const { i18n } = useLingui();
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
    <div data-testid="comments-shell" className="flex flex-col gap-4">
      <h1 data-testid="comments-heading" className="text-2xl font-semibold">
        {i18n._(M.heading)}
      </h1>
      <div
        data-testid="comments-tabs"
        role="tablist"
        className="border-border flex items-center gap-1 border-b"
      >
        {TABS.map((status) => (
          <Button
            key={status}
            type="button"
            variant={tab === status ? "secondary" : "ghost"}
            size="sm"
            data-testid={`comments-tab-${status}`}
            aria-pressed={tab === status}
            onClick={() => {
              reset(status);
            }}
          >
            {i18n._(STATUS_LABELS[status])}{" "}
            <span
              data-testid={`comments-count-${status}`}
              className="text-muted-foreground"
            >
              {counts.data?.[status] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      <div data-testid="comments-filters" className="flex items-center gap-2">
        <Input
          type="search"
          data-testid="comments-search"
          aria-label={i18n._(M.searchLabel)}
          placeholder={i18n._(M.searchPlaceholder)}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Input
          type="number"
          data-testid="comments-entry-filter"
          aria-label={i18n._(M.entryLabel)}
          placeholder={i18n._(M.entryPlaceholder)}
          value={entryFilter}
          onChange={(event) => setEntryFilter(event.target.value)}
        />
      </div>

      {picked.size > 0 ? (
        <div
          data-testid="comments-bulk-bar"
          className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
        >
          <span data-testid="comments-bulk-count">{picked.size}</span>
          <div className="flex items-center gap-1">
            {BULK_ACTIONS.map((action) => (
              <Button
                key={action}
                type="button"
                variant="ghost"
                size="xs"
                data-testid={`comments-bulk-${action}`}
                disabled={bulk.isPending}
                onClick={() => runBulk(action)}
                className={
                  isDestructiveAction(action)
                    ? DESTRUCTIVE_ACTION_CLASS
                    : undefined
                }
              >
                {i18n._(ACTION_LABELS[action])}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {list.isLoading ? (
        <div data-testid="comments-loading" />
      ) : list.isError ? (
        <div data-testid="comments-error" className="text-destructive text-sm">
          <Trans id="plugin.comments.error" message="Failed to load comments" />
        </div>
      ) : (list.data ?? []).length === 0 ? (
        // Tab-agnostic copy on purpose: interpolating the (translated)
        // status word mid-sentence breaks grammatical agreement in
        // several launch locales, so the queue name stays in the tab.
        <p
          data-testid="comments-empty"
          className="text-muted-foreground text-sm"
        >
          <Trans id="plugin.comments.empty" message="No comments to show" />
        </p>
      ) : (
        <table data-testid="comments-table" className="w-full">
          <tbody className="flex flex-col gap-2">
            {(list.data ?? []).map((comment) => (
              <tr
                key={comment.id}
                data-testid={`comment-row-${comment.id}`}
                className="border-border bg-card flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <td className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    data-testid={`comment-select-${comment.id}`}
                    aria-label={i18n._(
                      M.selectLabel.id,
                      { id: comment.id },
                      { message: M.selectLabel.message },
                    )}
                    checked={picked.has(comment.id)}
                    onCheckedChange={() => togglePicked(comment.id)}
                    className="mt-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`comment-open-${comment.id}`}
                    onClick={() => setSelected(comment)}
                    className="justify-start truncate"
                  >
                    {comment.authorName}
                  </Button>
                </td>
                <td
                  data-testid={`comment-excerpt-${comment.id}`}
                  className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
                >
                  {comment.bodyMd.slice(0, 80)}
                </td>
                <td className="flex items-center gap-1">
                  {ACTIONS[tab].map((action) => (
                    <Button
                      key={action}
                      type="button"
                      variant="ghost"
                      size="xs"
                      data-testid={`comment-${action}-${comment.id}`}
                      disabled={moderation.isPending}
                      onClick={() =>
                        moderation.mutate({ action, id: comment.id })
                      }
                      className={
                        isDestructiveAction(action)
                          ? DESTRUCTIVE_ACTION_CLASS
                          : undefined
                      }
                    >
                      {i18n._(ACTION_LABELS[action])}
                    </Button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected ? (
        <aside
          data-testid="comment-detail"
          className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3"
        >
          {/* Moderator sees the raw markdown source as text, not rendered HTML. */}
          <div data-testid="comment-detail-body" className="text-sm">
            {selected.bodyMd}
          </div>
          <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="font-medium">
              <Trans id="plugin.comments.detail.author" message="Author" />
            </dt>
            <dd data-testid="comment-detail-author">{selected.authorName}</dd>
            <dt className="font-medium">
              <Trans id="plugin.comments.detail.email" message="Email" />
            </dt>
            <dd data-testid="comment-detail-email">{selected.authorEmail}</dd>
            <dt className="font-medium">
              <Trans id="plugin.comments.detail.entry" message="Entry" />
            </dt>
            <dd data-testid="comment-detail-entry">{selected.entryId}</dd>
            <dt className="font-medium">
              <Trans id="plugin.comments.detail.ipHash" message="IP hash" />
            </dt>
            <dd data-testid="comment-detail-ip">{selected.ipHash ?? "—"}</dd>
            <dt className="font-medium">
              <Trans
                id="plugin.comments.detail.submitted"
                message="Submitted"
              />
            </dt>
            <dd data-testid="comment-detail-date">{selected.createdAt}</dd>
          </dl>
        </aside>
      ) : null}
    </div>
  );
}
