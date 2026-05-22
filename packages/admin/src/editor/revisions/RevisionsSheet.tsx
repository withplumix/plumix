import type { ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageCircle, MessageCircleMore } from "lucide-react";

import { RevisionDiffDialog } from "./RevisionDiffDialog.js";

interface RevisionListItem {
  readonly id: number;
  readonly title: string;
  readonly updatedAt: Date;
  readonly authorId: number;
  readonly authorName: string | null;
  readonly authorEmail: string | null;
  // Author-supplied label for the revision. `null` when unset; the
  // row UI renders an em dash placeholder so existing rows pre-#289
  // slice 3 stay legible.
  readonly message: string | null;
}

interface RevisionPage {
  readonly revisions: readonly RevisionListItem[];
  readonly nextCursor: string | null;
}

interface DiffSnapshot {
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly content: unknown;
  readonly meta: Readonly<Record<string, unknown>>;
}

interface RevisionsSheetProps {
  readonly entryId: number;
  readonly fetchPage: (input: {
    readonly entryId: number;
    readonly cursor: string | null;
  }) => Promise<RevisionPage>;
  // Injected so the admin can plug in its own intl helper and tests
  // can stub it deterministically (must return a stable string).
  readonly relativeTime: (date: Date) => string;
  // Modal-only fetchers — the dev-mode JSON diff dialog reads from
  // these. The inline diff panel was removed in slice 2; previews
  // now live on the editor route via `?revision=<id>`.
  readonly fetchRevision: (revisionId: number) => Promise<DiffSnapshot>;
  readonly fetchCurrent: (entryId: number) => Promise<DiffSnapshot>;
  // Fires when the user clicks a row body — caller is expected to
  // navigate to the preview URL. The sheet closes itself afterwards
  // so the editor surface is unobstructed.
  readonly onPreview: (revisionId: number) => void;
  // PATCHes `revision.message`. `null` clears the comment. The sheet
  // owns the optimistic-update path so callers don't have to wire
  // cache invalidation per render.
  readonly onSaveMessage: (input: {
    readonly revisionId: number;
    readonly message: string | null;
  }) => Promise<void>;
}

export function RevisionsSheet({
  entryId,
  fetchPage,
  relativeTime,
  fetchRevision,
  fetchCurrent,
  onPreview,
  onSaveMessage,
}: RevisionsSheetProps): ReactElement {
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["entry.revisions", entryId],
    enabled: open,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage({ entryId, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor,
  });

  const [diffModalRevisionId, setDiffModalRevisionId] = useState<number | null>(
    null,
  );
  const allRevisions = query.data?.pages.flatMap((p) => p.revisions) ?? [];
  const hasMore = Boolean(query.data?.pages.at(-1)?.nextCursor);

  function handlePreview(revisionId: number): void {
    onPreview(revisionId);
    setOpen(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDiffModalRevisionId(null);
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="revisions-sheet-trigger"
        >
          Revisions
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        data-plumix-revisions-sheet=""
        className="overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Revisions</SheetTitle>
          <SheetDescription>
            Every save creates a new revision. Newest first.
          </SheetDescription>
        </SheetHeader>
        {(() => {
          // Both All and Publishes render the identical list today —
          // every revision is a publish. Once a revision-kind field
          // lands, Publishes will filter and the two panels diverge.
          const listPanel = (
            <ListSection
              isLoading={query.isLoading}
              isError={query.isError}
              allRevisions={allRevisions}
              relativeTime={relativeTime}
              onPreview={handlePreview}
              onOpenDiff={setDiffModalRevisionId}
              onSaveMessage={onSaveMessage}
              hasMore={hasMore}
              isFetchingNextPage={query.isFetchingNextPage}
              fetchNextPage={() => void query.fetchNextPage()}
            />
          );
          return (
            <Tabs defaultValue="all" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="all" data-testid="revisions-tab-all">
                  All
                </TabsTrigger>
                <TabsTrigger
                  value="publishes"
                  data-testid="revisions-tab-publishes"
                >
                  Publishes
                </TabsTrigger>
                <TabsTrigger
                  value="autosaves"
                  data-testid="revisions-tab-autosaves"
                >
                  Autosaves
                </TabsTrigger>
              </TabsList>
              <TabsContent value="all">{listPanel}</TabsContent>
              <TabsContent value="publishes">{listPanel}</TabsContent>
              <TabsContent value="autosaves">
                <div
                  data-testid="revisions-autosaves-empty"
                  className="text-muted-foreground px-4 py-6 text-sm"
                >
                  Autosaves will appear here once drafts-of-published lands.
                </div>
              </TabsContent>
            </Tabs>
          );
        })()}
      </SheetContent>
      <RevisionDiffDialog
        entryId={entryId}
        revisionId={diffModalRevisionId}
        onOpenChange={(o) => {
          if (!o) setDiffModalRevisionId(null);
        }}
        fetchRevision={fetchRevision}
        fetchCurrent={fetchCurrent}
      />
    </Sheet>
  );
}

interface ListSectionProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly allRevisions: readonly RevisionListItem[];
  readonly relativeTime: (date: Date) => string;
  readonly onPreview: (id: number) => void;
  readonly onOpenDiff: (id: number) => void;
  readonly onSaveMessage: (input: {
    readonly revisionId: number;
    readonly message: string | null;
  }) => Promise<void>;
  readonly hasMore: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => void;
}

function ListSection({
  isLoading,
  isError,
  allRevisions,
  relativeTime,
  onPreview,
  onOpenDiff,
  onSaveMessage,
  hasMore,
  isFetchingNextPage,
  fetchNextPage,
}: ListSectionProps): ReactElement {
  return (
    <>
      {isLoading ? (
        <ul
          data-testid="revisions-sheet-loading"
          aria-label="Loading revisions"
          aria-busy="true"
          className="divide-y px-4 py-2"
        >
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex items-center gap-1 py-2">
              <div className="min-w-0 flex-1 p-2">
                <Skeleton className="mb-2 h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
            </li>
          ))}
        </ul>
      ) : null}
      {isError ? (
        <div
          data-testid="revisions-sheet-error"
          className="text-destructive px-4 py-6"
        >
          Failed to load revisions.
        </div>
      ) : null}
      {!isLoading && allRevisions.length === 0 ? (
        <div data-testid="revisions-sheet-empty" className="px-4 py-6">
          No revisions yet.
        </div>
      ) : null}
      {allRevisions.length > 0 ? (
        <ul data-testid="revisions-sheet-list" className="divide-y px-4 py-2">
          {allRevisions.map((rev) => (
            <RevisionRow
              key={rev.id}
              revision={rev}
              relativeTime={relativeTime}
              onPreview={onPreview}
              onOpenDiff={onOpenDiff}
              onSaveMessage={onSaveMessage}
            />
          ))}
        </ul>
      ) : null}
      {hasMore ? (
        <div className="px-4 py-4">
          <Button
            variant="outline"
            size="sm"
            data-testid="revisions-sheet-load-more"
            onClick={fetchNextPage}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

interface RevisionRowProps {
  readonly revision: RevisionListItem;
  readonly relativeTime: (date: Date) => string;
  readonly onPreview: (id: number) => void;
  readonly onOpenDiff: (id: number) => void;
  readonly onSaveMessage: (input: {
    readonly revisionId: number;
    readonly message: string | null;
  }) => Promise<void>;
}

function RevisionRow({
  revision,
  relativeTime,
  onPreview,
  onOpenDiff,
  onSaveMessage,
}: RevisionRowProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(revision.message ?? "");
  const [saving, setSaving] = useState(false);

  // Toggle: re-clicking the icon while the editor is open closes it
  // (without destroying the draft for the *next* open — `openEditor`
  // re-seeds from the current message on each open). Without this,
  // a second click would silently reset the in-progress text.
  function toggleEditor(): void {
    if (editing) {
      setEditing(false);
      return;
    }
    setDraft(revision.message ?? "");
    setEditing(true);
  }
  async function save(): Promise<void> {
    const next = draft.trim();
    setSaving(true);
    try {
      await onSaveMessage({
        revisionId: revision.id,
        message: next.length === 0 ? null : next,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li
      data-testid={`revisions-sheet-item-${revision.id}`}
      className="flex flex-col gap-1 py-2"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid={`revisions-sheet-item-${revision.id}-select`}
          onClick={() => onPreview(revision.id)}
          className="hover:bg-accent min-w-0 flex-1 rounded-md p-2 text-left"
        >
          <div className="truncate text-sm font-medium">{revision.title}</div>
          <div className="text-muted-foreground text-xs">
            <span>
              {revision.authorName ?? revision.authorEmail ?? "Unknown"}
            </span>
            {" · "}
            <span>{relativeTime(revision.updatedAt)}</span>
          </div>
        </button>
        <button
          type="button"
          data-testid={`revisions-sheet-item-${revision.id}-comment`}
          aria-label={
            revision.message === null ? "Add comment" : "Edit comment"
          }
          aria-pressed={editing}
          onClick={toggleEditor}
          className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        >
          {revision.message === null ? (
            <MessageCircle className="h-4 w-4" aria-hidden />
          ) : (
            <MessageCircleMore
              className="text-foreground h-4 w-4"
              aria-hidden
            />
          )}
        </button>
        <button
          type="button"
          data-testid={`revisions-sheet-item-${revision.id}-diff`}
          aria-label="View JSON diff"
          onClick={() => onOpenDiff(revision.id)}
          className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-xs"
        >
          &lt;/&gt;
        </button>
      </div>
      {editing ? (
        <div
          data-testid={`revisions-sheet-item-${revision.id}-comment-editor`}
          className="flex items-start gap-2 px-2"
        >
          <Input
            type="text"
            data-testid={`revisions-sheet-item-${revision.id}-comment-input`}
            value={draft}
            maxLength={280}
            placeholder="Describe this revision…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              // Skip Enter while an IME composition is active (CJK
              // input methods commit on Enter to accept the candidate;
              // saving here would fire prematurely).
              if (e.key === "Enter" && !saving && !e.nativeEvent.isComposing) {
                void save();
              }
            }}
            className="h-8 text-xs"
          />

          <Button
            variant="default"
            size="sm"
            data-testid={`revisions-sheet-item-${revision.id}-comment-save`}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "…" : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid={`revisions-sheet-item-${revision.id}-comment-cancel`}
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      ) : revision.message !== null ? (
        <div
          data-testid={`revisions-sheet-item-${revision.id}-comment-display`}
          className="text-muted-foreground truncate px-2 text-xs italic"
        >
          {revision.message}
        </div>
      ) : null}
    </li>
  );
}
