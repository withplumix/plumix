import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { Button } from "@/components/ui/button.js";
import { defineMessage } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

// View-scoped bulk action bar (WordPress model): the Trash view offers
// Restore + Delete permanently; every other view offers Trash. Keying off
// the active view sidesteps mixed-status selections entirely. Rendered
// only when at least one row is selected.
const M = {
  selected: defineMessage({
    id: "entries.list.bulk.selected",
    message:
      "{count, plural, one {# entry selected} other {# entries selected}}",
    comment: "count: number of selected entries",
  }),
  trash: defineMessage({
    id: "entries.list.bulk.trash",
    message: "Move to trash",
  }),
  restore: defineMessage({
    id: "entries.list.bulk.restore",
    message: "Restore",
  }),
  delete: defineMessage({
    id: "entries.list.bulk.delete",
    message: "Delete permanently",
  }),
  trashTitle: defineMessage({
    id: "entries.list.bulk.trashTitle",
    message:
      "{count, plural, one {Move # entry to trash?} other {Move # entries to trash?}}",
  }),
  deleteTitle: defineMessage({
    id: "entries.list.bulk.deleteTitle",
    message:
      "{count, plural, one {Delete # entry permanently?} other {Delete # entries permanently?}}",
  }),
  deleteBody: defineMessage({
    id: "entries.list.bulk.deleteBody",
    message:
      "This permanently deletes the selected entries and their revisions. It cannot be undone.",
  }),
  confirm: defineMessage({
    id: "entries.list.bulk.confirm",
    message: "Confirm",
  }),
  cancel: defineMessage({ id: "entries.list.bulk.cancel", message: "Cancel" }),
} satisfies Record<string, MessageDescriptor>;

export function EntriesBulkBar({
  count,
  view,
  busy,
  onTrash,
  onRestore,
  onDeletePermanent,
}: {
  readonly count: number;
  readonly view: "trash" | "active";
  readonly busy: boolean;
  readonly onTrash: () => void;
  readonly onRestore: () => void;
  readonly onDeletePermanent: () => void;
}): ReactNode {
  const { i18n } = useLingui();
  const [dialog, setDialog] = useState<"trash" | "delete" | null>(null);

  const plural = (m: MessageDescriptor): string =>
    i18n._(m.id, { count }, { message: m.message });

  return (
    <div
      data-testid="content-list-bulk-bar"
      className="bg-muted/40 flex items-center gap-3 rounded-md border px-4 py-2"
    >
      <span
        data-testid="content-list-bulk-count"
        className="text-sm font-medium"
      >
        {plural(M.selected)}
      </span>
      <div className="ms-auto flex items-center gap-2">
        {view === "trash" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onRestore}
              data-testid="content-list-bulk-restore"
            >
              {i18n._(M.restore.id, {}, { message: M.restore.message })}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                // eslint-disable-next-line lingui/no-unlocalized-strings -- dialog discriminant, not UI copy
                setDialog("delete");
              }}
              data-testid="content-list-bulk-delete"
            >
              {i18n._(M.delete.id, {}, { message: M.delete.message })}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setDialog("trash");
            }}
            data-testid="content-list-bulk-trash"
          >
            {i18n._(M.trash.id, {}, { message: M.trash.message })}
          </Button>
        )}
      </div>

      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "delete"
                ? plural(M.deleteTitle)
                : plural(M.trashTitle)}
            </AlertDialogTitle>
            {dialog === "delete" ? (
              <AlertDialogDescription>
                {i18n._(M.deleteBody.id, {}, { message: M.deleteBody.message })}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {i18n._(M.cancel.id, {}, { message: M.cancel.message })}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="content-list-bulk-confirm"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                const action = dialog;
                setDialog(null);
                if (action === "delete") onDeletePermanent();
                else if (action === "trash") onTrash();
              }}
            >
              {i18n._(M.confirm.id, {}, { message: M.confirm.message })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
