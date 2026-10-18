import type { EntryConflict } from "@/editor/autosave.js";
import type { LeaseHolder } from "@/editor/edit-lease.js";

/** Open while the author has a conflict to resolve. */
export type ConflictDialogState =
  | { readonly open: false }
  | { readonly open: true; readonly conflict: EntryConflict };

export type ConflictDialogEvent =
  | { readonly type: "conflict"; readonly conflict: EntryConflict }
  | { readonly type: "keepMine" }
  | { readonly type: "loadTheirs" };

export function conflictDialog(
  _state: ConflictDialogState,
  event: ConflictDialogEvent,
): ConflictDialogState {
  if (event.type === "conflict")
    return { open: true, conflict: event.conflict };
  return { open: false };
}

/** Another user holding the entry's lease; the author's own lease names no one. */
export function editingElsewhere(
  conflict: EntryConflict,
  userId: number,
): LeaseHolder | undefined {
  return conflict.holder?.id === userId ? undefined : conflict.holder;
}
