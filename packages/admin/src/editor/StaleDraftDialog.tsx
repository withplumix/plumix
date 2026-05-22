import type { ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";

interface StaleDraftDialogProps {
  readonly open: boolean;
  // The user's pending autosave content + the current live row. Both
  // already loaded by the route — passed in so the Compare toggle
  // doesn't need to re-fetch.
  readonly autosaveSnapshot: unknown;
  readonly liveSnapshot: unknown;
  // `Use mine` keeps the autosave seeded into the canvas. `Use theirs`
  // discards the autosave row server-side; the route's success
  // handler then refetches live and the editor re-seeds.
  readonly onUseMine: () => void;
  readonly onUseTheirs: () => void;
  // True while the discard mutation is in flight after Use theirs.
  readonly isResolving: boolean;
}

// Three-action resolver surfaced at editor mount when a pending
// autosave was anchored against an older live row than what's on the
// server now. Builder.io's history UI uses the same three options —
// "yours" / "theirs" / "compare" — for parallel-edit conflicts.
export function StaleDraftDialog({
  open,
  autosaveSnapshot,
  liveSnapshot,
  onUseMine,
  onUseTheirs,
  isResolving,
}: StaleDraftDialogProps): ReactElement {
  const [comparing, setComparing] = useState(false);
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-4xl"
        showCloseButton={false}
        data-testid="stale-draft-dialog"
        // Radix Dialog closes on Escape / outside-click by default;
        // prevent both so the resolver actually blocks until the user
        // picks one of the three actions. Without these, the dialog
        // dismisses but the canvas stays seeded with the stale
        // autosave content — silent contract violation.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Your draft is out of date</DialogTitle>
          <DialogDescription>
            Someone else published changes to this entry while you had pending
            edits. Pick which version to keep before continuing.
          </DialogDescription>
        </DialogHeader>
        {comparing ? (
          <div
            data-testid="stale-draft-compare-panes"
            // `aria-live` so screen-reader users get a "compare opened"
            // announcement when they click the toggle. Without this
            // the JSON appears silently and the toggle reads as no-op.
            aria-live="polite"
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
          >
            <ComparePane label="Your draft" snapshot={autosaveSnapshot} />
            <ComparePane label="Live now" snapshot={liveSnapshot} />
          </div>
        ) : null}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            data-testid="stale-draft-compare"
            onClick={() => setComparing((prev) => !prev)}
          >
            {comparing ? "Hide comparison" : "Compare"}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="stale-draft-use-theirs"
              onClick={onUseTheirs}
              disabled={isResolving}
            >
              {isResolving ? "Discarding…" : "Use theirs"}
            </Button>
            <Button
              variant="default"
              size="sm"
              data-testid="stale-draft-use-mine"
              onClick={onUseMine}
              disabled={isResolving}
            >
              Use mine
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComparePane({
  label,
  snapshot,
}: {
  readonly label: string;
  readonly snapshot: unknown;
}): ReactElement {
  return (
    <section>
      <div className="text-muted-foreground mb-1 text-xs font-medium">
        {label}
      </div>
      <pre className="bg-muted max-h-72 overflow-auto rounded-md p-2 text-xs">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </section>
  );
}
