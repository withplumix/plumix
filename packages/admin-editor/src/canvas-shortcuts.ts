import type { CameraStoreApi } from "./camera-store.js";
import type { LayoutGate } from "./layout-gate.js";
import type { EditorShortcutId } from "./shortcuts.js";
import type { EditorStoreApi } from "./store.js";

/**
 * The host answers these through its own listeners, so they reach the canvas
 * keys only forwarded from the canvas; answering a host press too would act
 * twice.
 */
const HOST_HANDLED: ReadonlySet<EditorShortcutId> = new Set([
  "help.open",
  "palette.open",
  "history.undo",
  "history.redo",
  "panels.toggle",
  "selection.delete",
]);

export function canvasHandlesHostKey(id: EditorShortcutId): boolean {
  return !HOST_HANDLED.has(id);
}

export interface CanvasShortcutDeps {
  readonly store: EditorStoreApi;
  readonly camera: CameraStoreApi;
  readonly zoomToSelection: () => void;
  /** The vendored sidebar owns Cmd+B through its own window listener. */
  readonly togglePanels: () => void;
  readonly layout?: LayoutGate;
}

/** Runs a pressed shortcut; the held pan binding is the caller's to track. */
export function runCanvasShortcut(
  id: EditorShortcutId,
  { store, camera, zoomToSelection, togglePanels, layout }: CanvasShortcutDeps,
): void {
  if (id === "canvas.fit") camera.getState().enableFit();
  else if (id === "canvas.frameSelection") zoomToSelection();
  else if (id === "canvas.actualSize") camera.getState().zoomToCenter(1);
  else if (id === "canvas.xray") store.getState().toggleXray();
  else if (id === "help.open") store.getState().setShortcutsOpen(true);
  else if (id === "palette.open") store.getState().setPaletteOpen(true);
  else if (id === "history.undo") store.getState().undo();
  else if (id === "history.redo") store.getState().redo();
  else if (id === "selection.delete") {
    if (layout?.editsLayout !== false) store.getState().removeSelected();
  } else if (id === "panels.toggle") togglePanels();
}
