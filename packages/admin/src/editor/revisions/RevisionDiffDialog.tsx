import type { ReactElement } from "react";
import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { useQuery } from "@tanstack/react-query";

interface DiffSnapshot {
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly content: unknown;
  readonly meta: Readonly<Record<string, unknown>>;
}

interface RevisionDiffDialogProps {
  readonly entryId: number;
  readonly revisionId: number | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly fetchRevision: (revisionId: number) => Promise<DiffSnapshot>;
  readonly fetchCurrent: (entryId: number) => Promise<DiffSnapshot>;
}

export function RevisionDiffDialog({
  entryId,
  revisionId,
  onOpenChange,
  fetchRevision,
  fetchCurrent,
}: RevisionDiffDialogProps): ReactElement {
  // Sticky id keeps query results visible during Radix's close
  // animation: once `revisionId` flips to null the queries would
  // disable and the panes would flash to "Loading…" while the
  // dialog fades out. Use the setState-during-render memoization
  // pattern (refs would trip react-hooks/cannot-access-during-render).
  const [stickyRevisionId, setStickyRevisionId] = useState<number | null>(
    revisionId,
  );
  if (revisionId !== null && revisionId !== stickyRevisionId) {
    setStickyRevisionId(revisionId);
  }
  // Same query keys as the inline diff section in RevisionsSheet — both
  // surfaces read from a single TanStack cache entry, so opening the
  // modal after the inline view doesn't re-fetch.
  const revisionQuery = useQuery({
    queryKey: ["entry.revision.diff", stickyRevisionId],
    enabled: stickyRevisionId !== null,
    queryFn: () => fetchRevision(stickyRevisionId ?? 0),
  });
  const currentQuery = useQuery({
    queryKey: ["entry.current.diff", entryId],
    enabled: stickyRevisionId !== null,
    queryFn: () => fetchCurrent(entryId),
  });
  return (
    <Dialog open={revisionId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl"
        data-testid="revision-diff-modal"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Revision JSON diff</DialogTitle>
          <DialogDescription>
            Side-by-side: this revision (left) vs. the current entry (right).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DiffPane
            label="This revision"
            snapshot={revisionQuery.data}
            isError={revisionQuery.isError}
          />
          <DiffPane
            label="Current"
            snapshot={currentQuery.data}
            isError={currentQuery.isError}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffPane({
  label,
  snapshot,
  isError,
}: {
  readonly label: string;
  readonly snapshot: DiffSnapshot | undefined;
  readonly isError: boolean;
}): ReactElement {
  const labelId = useId();
  if (isError) {
    return (
      <section aria-labelledby={labelId}>
        <div
          id={labelId}
          className="text-muted-foreground mb-1 text-xs font-medium"
        >
          {label}
        </div>
        <pre
          className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs"
          data-testid="revision-diff-modal-error"
        >
          Failed to load snapshot.
        </pre>
      </section>
    );
  }
  if (!snapshot) {
    return (
      <section aria-labelledby={labelId} aria-busy="true">
        <div
          id={labelId}
          className="text-muted-foreground mb-1 text-xs font-medium"
        >
          {label}
        </div>
        <div
          data-testid="revision-diff-modal-loading"
          className="max-h-96 space-y-2 rounded-md border p-3"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className={i % 3 === 0 ? "h-3 w-2/3" : "h-3"} />
          ))}
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby={labelId}>
      <div
        id={labelId}
        className="text-muted-foreground mb-1 text-xs font-medium"
      >
        {label}
      </div>
      <pre className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </section>
  );
}
