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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

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
}

export function RevisionsSheet({
  entryId,
  fetchPage,
  relativeTime,
  fetchRevision,
  fetchCurrent,
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
    // `enabled` guards null; the non-null assertion is the
    // narrowest fix that satisfies TanStack's exhaustive typing
    // without dragging an error factory into a UI component.
    queryFn: () => fetchRevision(selectedRevisionId ?? 0),
  });
  const currentQuery = useQuery({
    queryKey: ["entry.current.diff", entryId],
    enabled: selectedRevisionId !== null,
    queryFn: () => fetchCurrent(entryId),
  });

  const allRevisions = query.data?.pages.flatMap((p) => p.revisions) ?? [];
  const hasMore = Boolean(query.data?.pages.at(-1)?.nextCursor);
  const showDiff = selectedRevisionId !== null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
            <Button
              variant="outline"
              size="sm"
              data-testid="revisions-sheet-back"
              onClick={() => setSelectedRevisionId(null)}
              className="mt-2 w-fit"
            >
              ← Back to list
            </Button>
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
          <ListSection
            isLoading={query.isLoading}
            isError={query.isError}
            allRevisions={allRevisions}
            relativeTime={relativeTime}
            onSelect={setSelectedRevisionId}
            hasMore={hasMore}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={() => void query.fetchNextPage()}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface ListSectionProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly allRevisions: readonly RevisionListItem[];
  readonly relativeTime: (date: Date) => string;
  readonly onSelect: (id: number) => void;
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
              className="py-2"
            >
              <button
                type="button"
                data-testid={`revisions-sheet-item-${rev.id}-select`}
                onClick={() => onSelect(rev.id)}
                className="hover:bg-accent w-full rounded-md p-2 text-left"
              >
                <div className="text-sm font-medium">{rev.title}</div>
                <div className="text-muted-foreground text-xs">
                  <span>{rev.authorName ?? rev.authorEmail ?? "Unknown"}</span>
                  {" · "}
                  <span>{relativeTime(rev.updatedAt)}</span>
                </div>
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
