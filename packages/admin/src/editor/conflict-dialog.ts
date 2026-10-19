import type { EntryConflict } from "@/editor/autosave.js";

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
