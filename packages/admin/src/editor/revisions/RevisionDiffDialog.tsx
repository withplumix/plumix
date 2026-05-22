import type { ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
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
  const revisionQuery = useQuery({
    queryKey: ["revision-diff-dialog.revision", revisionId],
    enabled: revisionId !== null,
    queryFn: () => fetchRevision(revisionId ?? 0),
  });
  const currentQuery = useQuery({
    queryKey: ["revision-diff-dialog.current", entryId],
    enabled: revisionId !== null,
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
  return (
    <section>
      <div className="text-muted-foreground mb-1 text-xs font-medium">
        {label}
      </div>
      <pre
        className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs"
        data-testid={isError ? "revision-diff-modal-error" : undefined}
      >
        {isError
          ? "Failed to load snapshot."
          : snapshot
            ? JSON.stringify(snapshot, null, 2)
            : "Loading…"}
      </pre>
    </section>
  );
}
