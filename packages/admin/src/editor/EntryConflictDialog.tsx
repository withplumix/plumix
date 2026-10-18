import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useState } from "react";
import { ComparePane } from "@/editor/StaleDraftDialog.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@plumix/admin-ui/dialog";

const M = {
  yourChanges: defineMessage({
    id: "editor.conflict.yourChanges",
    message: "Your changes",
  }),
  savedNow: defineMessage({
    id: "editor.conflict.savedNow",
    message: "Saved now",
  }),
} satisfies Record<string, MessageDescriptor>;

interface EntryConflictDialogProps {
  readonly open: boolean;
  /** When the other write landed. */
  readonly changedAt: Date | null;
  /** The author's unsaved copy, and the entry as it is saved now. */
  readonly mineSnapshot: unknown;
  readonly theirsSnapshot: unknown;
  /** Overwrite the other write with the author's changes. */
  readonly onKeepMine: () => void;
  /** Discard the author's changes and reload the entry. */
  readonly onLoadTheirs: () => void;
}

/**
 * A save found the entry changed since the author opened it. Autosave is
 * paused and their changes kept until they pick one.
 */
export function EntryConflictDialog({
  open,
  changedAt,
  mineSnapshot,
  theirsSnapshot,
  onKeepMine,
  onLoadTheirs,
}: EntryConflictDialogProps): ReactElement {
  const [comparing, setComparing] = useState(false);
  const label = useLabel();
  const { formatDate } = useFormatters();
  const when = changedAt
    ? formatDate(changedAt, { dateStyle: "medium", timeStyle: "short" })
    : "";
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-4xl"
        showCloseButton={false}
        data-testid="entry-conflict-dialog"
        // Dismissing would leave autosave paused with no way to resume.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            <Trans
              id="editor.conflict.title"
              message="This entry changed since you opened it"
            />
          </DialogTitle>
          <DialogDescription data-testid="entry-conflict-changed-at">
            <Trans
              id="editor.conflict.description"
              message="It was saved elsewhere at {when}. Your changes are kept here and haven't been saved."
              values={{ when }}
            />
          </DialogDescription>
        </DialogHeader>
        {comparing ? (
          <div
            data-testid="entry-conflict-compare-panes"
            aria-live="polite"
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
          >
            <ComparePane label={label(M.yourChanges)} snapshot={mineSnapshot} />
            <ComparePane label={label(M.savedNow)} snapshot={theirsSnapshot} />
          </div>
        ) : null}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            data-testid="entry-conflict-compare"
            onClick={() => setComparing((prev) => !prev)}
          >
            {comparing ? (
              <Trans
                id="editor.conflict.hideComparison"
                message="Hide comparison"
              />
            ) : (
              <Trans id="editor.conflict.compare" message="Compare" />
            )}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="entry-conflict-load-theirs"
              onClick={onLoadTheirs}
            >
              <Trans id="editor.conflict.loadTheirs" message="Load theirs" />
            </Button>
            <Button
              variant="default"
              size="sm"
              data-testid="entry-conflict-keep-mine"
              onClick={onKeepMine}
            >
              <Trans id="editor.conflict.keepMine" message="Keep mine" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
