import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useState } from "react";
import { ComparePane } from "@/editor/StaleDraftDialog.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";

import type { EditConflictDialogProps } from "@plumix/core/admin";
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

/**
 * A save found the entry or user changed since the author opened it. Autosave
 * is paused and their changes kept until they pick one.
 */
export function EditConflictDialog({
  copy,
  open,
  changedAt,
  editingElsewhere,
  mineSnapshot,
  theirsSnapshot,
  onKeepMine,
  onLoadTheirs,
}: EditConflictDialogProps): ReactElement {
  const [comparing, setComparing] = useState(false);
  const label = useLabel();
  const { formatDate } = useFormatters();
  const holderName = editingElsewhere ? (
    <bdi>{editingElsewhere.name}</bdi>
  ) : null;
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-4xl"
        showCloseButton={false}
        data-testid="entry-conflict-dialog"
      >
        <DialogHeader>
          <DialogTitle>{label(copy.conflictTitle)}</DialogTitle>
          <DialogDescription data-testid="entry-conflict-changed-at">
            {changedAt ? (
              <Trans
                id="editor.conflict.description"
                message="It was saved elsewhere at {when}. Your changes are kept here and haven't been saved."
                values={{
                  when: formatDate(changedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                }}
              />
            ) : copy.conflictUntimed ? (
              label(copy.conflictUntimed)
            ) : (
              <Trans
                id="editor.conflict.descriptionUntimed"
                message="They were saved elsewhere. Your changes are kept here and haven't been saved."
              />
            )}
          </DialogDescription>
          {editingElsewhere ? (
            <DialogDescription data-testid="entry-conflict-holder">
              <Trans
                id="editor.conflict.holder"
                message="{name} is editing it now."
                values={{ name: holderName }}
                comment="name: the editing user's display name or email"
              />
            </DialogDescription>
          ) : null}
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
