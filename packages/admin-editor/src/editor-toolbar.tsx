import type { ReactElement } from "react";
import { useEffect } from "react";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";

import { canRedo, canUndo } from "./history.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

/** Top toolbar: undo/redo (more controls land here in later slices). */
export function EditorToolbar(): ReactElement {
  const undoAvailable = useEditorStore((s) => canUndo(s.history));
  const redoAvailable = useEditorStore((s) => canRedo(s.history));
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  return (
    <header
      className="bg-background flex items-center gap-1 border-b p-2"
      data-testid="plumix-editor-toolbar"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="plumix-undo"
        disabled={!undoAvailable}
        onClick={undo}
      >
        <Trans id="editor.toolbar.undo" message="Undo" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="plumix-redo"
        disabled={!redoAvailable}
        onClick={redo}
      >
        <Trans id="editor.toolbar.redo" message="Redo" />
      </Button>
    </header>
  );
}

/**
 * Global undo/redo keyboard shortcuts (Cmd/Ctrl+Z, +Shift to redo). Skips
 * edits in form controls / contenteditable so native field undo isn't hijacked.
 */
export function EditorShortcuts(): null {
  const store = useEditorStoreApi();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "z") return;
      // A held chord auto-repeats keydown; one press should be one step.
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) store.getState().redo();
      else store.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
  return null;
}
