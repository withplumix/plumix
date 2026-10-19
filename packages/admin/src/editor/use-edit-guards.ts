import type { EntryConflict } from "@/editor/autosave.js";
import type { EditLeaseNotice } from "@/editor/edit-lease.js";
import type { EditingCopy } from "@/editor/editing-copy.js";
import type { EditLeaseBannerProps } from "@/editor/EditLeaseBanner.js";
import type { EntryConflictDialogProps } from "@/editor/EntryConflictDialog.js";
import type { EditLease } from "@/editor/use-edit-lease.js";
import { useReducer, useState } from "react";
import { conflictDialog, editingElsewhere } from "@/editor/conflict-dialog.js";
import { useMutation, useQuery } from "@tanstack/react-query";

export interface EditGuardsOptions<Mine, Theirs> {
  readonly copy: EditingCopy;
  /** The signed-in user, whose own lease names no one else editing. */
  readonly userId: number;
  readonly lease: EditLease;
  /** What is saved now, fetched fresh for each conflict to compare against. */
  readonly theirs: {
    readonly queryKey: readonly unknown[];
    readonly fetch: () => Promise<Theirs>;
    /** In the same shape as the author's work, to compare side by side. */
    readonly snapshot: (saved: Theirs | undefined) => Mine | null;
  };
  /** Save `mine` again from the conflict's `etag`. */
  readonly keepMine: (etag: string, mine: Mine) => void;
  /** Drop the unsaved work before Load theirs reloads. */
  readonly discard?: () => void;
  /** Remount on what is saved now. */
  readonly reload: () => Promise<void>;
  readonly onBack: () => void;
}

export interface EditGuards<Mine> {
  /** A save was refused as stale: `mine` is the work it would have saved. */
  readonly reportConflict: (conflict: EntryConflict, mine: Mine) => void;
  readonly conflictDialog: EntryConflictDialogProps;
  readonly leaseBanner: (notice: EditLeaseNotice) => EditLeaseBannerProps;
}

/**
 * The conflict dialog and lease banner one editor shows for the resource it
 * edits from a copy, wired to its save, reload and lease.
 */
export function useEditGuards<Mine, Theirs>(
  options: EditGuardsOptions<Mine, Theirs>,
): EditGuards<Mine> {
  const { copy, userId, lease, theirs, keepMine, discard, reload, onBack } =
    options;
  const [conflict, dispatch] = useReducer(conflictDialog, { open: false });
  const [mine, setMine] = useState<{ readonly value: Mine } | null>(null);
  const theirsQuery = useQuery({
    queryKey: [...theirs.queryKey, conflict.open && conflict.conflict.etag],
    queryFn: theirs.fetch,
    enabled: conflict.open,
  });
  const takeOver = useMutation({
    mutationFn: lease.takeOver,
    onSuccess: reload,
  });

  return {
    reportConflict: (next, value) => {
      setMine({ value });
      dispatch({ type: "conflict", conflict: next });
    },
    conflictDialog: {
      copy,
      open: conflict.open,
      changedAt: conflict.open ? (conflict.conflict.updatedAt ?? null) : null,
      editingElsewhere: conflict.open
        ? editingElsewhere(conflict.conflict, userId)
        : undefined,
      mineSnapshot: mine?.value ?? null,
      theirsSnapshot: theirs.snapshot(theirsQuery.data),
      onKeepMine: () => {
        if (!conflict.open || mine === null) return;
        dispatch({ type: "keepMine" });
        keepMine(conflict.conflict.etag, mine.value);
      },
      onLoadTheirs: () => {
        dispatch({ type: "loadTheirs" });
        discard?.();
        void reload();
      },
    },
    leaseBanner: (notice) => ({
      copy,
      notice,
      onTakeOver: () => takeOver.mutate(),
      isTakingOver: takeOver.isPending,
      onBack,
    }),
  };
}
