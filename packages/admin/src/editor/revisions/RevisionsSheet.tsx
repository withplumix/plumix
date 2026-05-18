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
import { useInfiniteQuery } from "@tanstack/react-query";

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

interface RevisionsSheetProps {
  readonly entryId: number;
  readonly fetchPage: (input: {
    readonly entryId: number;
    readonly cursor: string | null;
  }) => Promise<RevisionPage>;
  // Injected so the admin can plug in its own intl helper and tests
  // can stub it deterministically (must return a stable string).
  readonly relativeTime: (date: Date) => string;
}

export function RevisionsSheet({
  entryId,
  fetchPage,
  relativeTime,
}: RevisionsSheetProps): ReactElement {
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["entry.revisions", entryId],
    enabled: open,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage({ entryId, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor,
  });

  const allRevisions = query.data?.pages.flatMap((p) => p.revisions) ?? [];
  const hasMore = Boolean(query.data?.pages.at(-1)?.nextCursor);

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
          <SheetTitle>Revisions</SheetTitle>
          <SheetDescription>
            Every save creates a new revision. Newest first.
          </SheetDescription>
        </SheetHeader>
        {query.isLoading ? (
          <div data-testid="revisions-sheet-loading" className="px-4 py-6">
            Loading revisions…
          </div>
        ) : null}
        {query.isError ? (
          <div
            data-testid="revisions-sheet-error"
            className="text-destructive px-4 py-6"
          >
            Failed to load revisions.
          </div>
        ) : null}
        {!query.isLoading && allRevisions.length === 0 ? (
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
                <div className="text-sm font-medium">{rev.title}</div>
                <div className="text-muted-foreground text-xs">
                  <span>{rev.authorName ?? rev.authorEmail ?? "Unknown"}</span>
                  {" · "}
                  <span>{relativeTime(rev.updatedAt)}</span>
                </div>
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
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
