import type { ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.js";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { RevisionDiffDialog } from "./RevisionDiffDialog.js";
import { RevisionDiffPanel } from "./RevisionDiffPanel.js";

interface RevisionListItem {
  readonly id: number;
  readonly title: string;
  readonly updatedAt: Date;
  readonly authorId: number;
  readonly authorName: string | null;
  readonly authorEmail: string | null;
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
  // Both fetchers are injected (consistent with `fetchPage`) so the
  // route layer owns RPC wiring and tests can stub deterministically.
  readonly fetchRevision: (revisionId: number) => Promise<DiffSnapshot>;
  readonly fetchCurrent: (entryId: number) => Promise<DiffSnapshot>;
  // When omitted the restore action is hidden — keeps the sheet usable
  // as a read-only diff viewer for roles without `edit_*` capabilities.
  readonly onRestore?: (revisionId: number) => Promise<void>;
}

export function RevisionsSheet({
  entryId,
  fetchPage,
  relativeTime,
  fetchRevision,
  fetchCurrent,
  onRestore,
}: RevisionsSheetProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(
    null,
  );
  const query = useInfiniteQuery({
    queryKey: ["entry.revisions", entryId],
    enabled: open,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage({ entryId, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const revisionQuery = useQuery({
    queryKey: ["entry.revision.diff", selectedRevisionId],
    enabled: selectedRevisionId !== null,
    // `enabled` already guards null; `?? 0` is the narrowest dodge
    // around TanStack's exhaustive typing without an `as` cast.
    queryFn: () => fetchRevision(selectedRevisionId ?? 0),
  });
  const currentQuery = useQuery({
    queryKey: ["entry.current.diff", entryId],
    enabled: selectedRevisionId !== null,
    queryFn: () => fetchCurrent(entryId),
  });

  const [restorePending, setRestorePending] = useState(false);
  const [diffModalRevisionId, setDiffModalRevisionId] = useState<number | null>(
    null,
  );
  const allRevisions = query.data?.pages.flatMap((p) => p.revisions) ?? [];
  const hasMore = Boolean(query.data?.pages.at(-1)?.nextCursor);
  const showDiff = selectedRevisionId !== null;
  const canRestore = onRestore !== undefined && selectedRevisionId !== null;

  async function handleRestore(): Promise<void> {
    if (!onRestore || selectedRevisionId === null) return;
    setRestorePending(true);
    try {
      await onRestore(selectedRevisionId);
      setSelectedRevisionId(null);
      setOpen(false);
    } finally {
      setRestorePending(false);
    }
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
          <SheetTitle>{showDiff ? "Revision diff" : "Revisions"}</SheetTitle>
          <SheetDescription>
            {showDiff
              ? "Changes between this revision and the current entry."
              : "Every save creates a new revision. Newest first."}
          </SheetDescription>
          {showDiff ? (
            <div className="mt-2 flex w-fit gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="revisions-sheet-back"
                onClick={() => setSelectedRevisionId(null)}
              >
                ← Back to list
              </Button>
              {canRestore ? (
                <Button
                  variant="default"
                  size="sm"
                  data-testid="revisions-sheet-restore"
                  disabled={restorePending}
                  onClick={() => void handleRestore()}
                >
                  {restorePending ? "Restoring…" : "Restore this revision"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>
        {showDiff ? (
          <DiffSection
            revisionLoading={revisionQuery.isLoading}
            currentLoading={currentQuery.isLoading}
            error={revisionQuery.isError || currentQuery.isError}
            revision={revisionQuery.data}
            current={currentQuery.data}
          />
        ) : (
          (() => {
            // Both All and Publishes render the identical list today —
            // every revision is a publish. Once a revision-kind field
            // exists (slice 2 of #289), Publishes will filter and the
            // two panels diverge. Sharing the element keeps the JSX
            // honest about the current shape.
            const listPanel = (
              <ListSection
                isLoading={query.isLoading}
                isError={query.isError}
                allRevisions={allRevisions}
                relativeTime={relativeTime}
                onSelect={setSelectedRevisionId}
                onOpenDiff={setDiffModalRevisionId}
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
          })()
        )}
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
  readonly onSelect: (id: number) => void;
  readonly onOpenDiff: (id: number) => void;
  readonly hasMore: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => void;
}

function ListSection({
  isLoading,
  isError,
  allRevisions,
  relativeTime,
  onSelect,
  onOpenDiff,
  hasMore,
  isFetchingNextPage,
  fetchNextPage,
}: ListSectionProps): ReactElement {
  return (
    <>
      {isLoading ? (
        <div data-testid="revisions-sheet-loading" className="px-4 py-6">
          Loading revisions…
        </div>
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
            <li
              key={rev.id}
              data-testid={`revisions-sheet-item-${rev.id}`}
              className="flex items-center gap-1 py-2"
            >
              <button
                type="button"
                data-testid={`revisions-sheet-item-${rev.id}-select`}
                onClick={() => onSelect(rev.id)}
                className="hover:bg-accent min-w-0 flex-1 rounded-md p-2 text-left"
              >
                <div className="truncate text-sm font-medium">{rev.title}</div>
                <div className="text-muted-foreground text-xs">
                  <span>{rev.authorName ?? rev.authorEmail ?? "Unknown"}</span>
                  {" · "}
                  <span>{relativeTime(rev.updatedAt)}</span>
                </div>
              </button>
              <button
                type="button"
                data-testid={`revisions-sheet-item-${rev.id}-diff`}
                aria-label="View JSON diff"
                onClick={() => onOpenDiff(rev.id)}
                className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-xs"
              >
                &lt;/&gt;
              </button>
            </li>
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

interface DiffSectionProps {
  readonly revisionLoading: boolean;
  readonly currentLoading: boolean;
  readonly error: boolean;
  readonly revision: DiffSnapshot | undefined;
  readonly current: DiffSnapshot | undefined;
}

function DiffSection({
  revisionLoading,
  currentLoading,
  error,
  revision,
  current,
}: DiffSectionProps): ReactElement {
  if (error) {
    return (
      <div
        data-testid="revisions-sheet-diff-error"
        className="text-destructive px-4 py-6"
      >
        Failed to load the diff.
      </div>
    );
  }
  if (revisionLoading || currentLoading || !revision || !current) {
    return (
      <div data-testid="revisions-sheet-diff-loading" className="px-4 py-6">
        Loading diff…
      </div>
    );
  }
  return (
    <div data-testid="revisions-sheet-diff" className="px-3">
      <RevisionDiffPanel revision={revision} current={current} />
    </div>
  );
}
