import type { ReactElement, ReactNode } from "react";
import { useEffect } from "react";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";
import { SidebarTrigger } from "@plumix/admin-ui/sidebar";

import { canRedo, canUndo } from "./history.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

/** Draft-mode actions for a published entry with a pending autosave. The host
 *  owns the mutations; the toolbar only renders the buttons and their state. */
export interface DraftMode {
  readonly hasPendingDraft: boolean;
  readonly onSaveDraft: () => void;
  readonly onPublishDraft: () => void;
  readonly onDiscardDraft: () => void;
  readonly isSaving: boolean;
  readonly isPublishing: boolean;
  readonly isDiscarding: boolean;
}

/** Publish wiring injected by the host (no orpc in this package). When
 *  `draftMode` is set the toolbar shows save/publish/discard; otherwise a plain
 *  Publish button (disabled once published). */
export interface PublishActions {
  readonly onPublish?: () => void;
  readonly isPublished?: boolean;
  readonly isPublishing?: boolean;
  readonly draftMode?: DraftMode;
}

/** Top toolbar: an inline inserter slot, undo/redo, plus the host-wired
 *  publish / draft actions. */
export function EditorToolbar({
  publish,
  inserter,
}: {
  readonly publish?: PublishActions;
  readonly inserter?: ReactNode;
}): ReactElement {
  const undoAvailable = useEditorStore((s) => canUndo(s.history));
  const redoAvailable = useEditorStore((s) => canRedo(s.history));
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  return (
    <header
      className="bg-background flex items-center gap-1 border-b p-2"
      data-testid="plumix-editor-toolbar"
    >
      {/* Collapses both rails for a focused canvas (also Cmd/Ctrl+B). */}
      <SidebarTrigger data-testid="plumix-rails-toggle" />
      {inserter}
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
      {publish ? <PublishControls publish={publish} /> : null}
    </header>
  );
}

function PublishControls({
  publish,
}: {
  readonly publish: PublishActions;
}): ReactElement {
  const { draftMode } = publish;
  if (draftMode) {
    const busy =
      draftMode.isSaving || draftMode.isPublishing || draftMode.isDiscarding;
    return (
      <div className="ms-auto flex items-center gap-2">
        {draftMode.hasPendingDraft ? (
          <span
            className="text-muted-foreground text-xs"
            data-testid="unpublished-changes-banner"
          >
            <Trans
              id="editor.toolbar.unpublished"
              message="Unpublished changes"
            />
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="editor-draft-discard"
          disabled={busy || !draftMode.hasPendingDraft}
          onClick={draftMode.onDiscardDraft}
        >
          <Trans id="editor.toolbar.discard" message="Discard" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="editor-draft-save"
          disabled={busy}
          onClick={draftMode.onSaveDraft}
        >
          <Trans id="editor.toolbar.saveDraft" message="Save draft" />
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="editor-draft-publish"
          disabled={busy || !draftMode.hasPendingDraft}
          onClick={draftMode.onPublishDraft}
        >
          <Trans id="editor.toolbar.publish" message="Publish" />
        </Button>
      </div>
    );
  }
  const { isPublishing = false, isPublished = false } = publish;
  return (
    <div className="ms-auto">
      <Button
        type="button"
        size="sm"
        data-testid="plumix-editor-publish-button"
        disabled={isPublishing || isPublished}
        onClick={publish.onPublish}
      >
        <Trans id="editor.toolbar.publish" message="Publish" />
      </Button>
    </div>
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
