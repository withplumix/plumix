import type { ReactElement, ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@plumix/admin-ui/alert-dialog";
import { Button } from "@plumix/admin-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plumix/admin-ui/dropdown-menu";
import {
  ArrowLeft,
  Code2,
  Eye,
  Pencil,
  Play,
  Redo2,
  Undo2,
} from "@plumix/admin-ui/icons";
import { Input } from "@plumix/admin-ui/input";

import { useEditorStore } from "./provider.js";

/** Draft-mode actions for a published entry with a pending autosave. The host
 *  owns the mutations; the header only renders the buttons and their state. */
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
 *  `draftMode` is set the header shows save/publish/discard; otherwise a plain
 *  Publish button (disabled once published). */
export interface PublishActions {
  readonly onPublish?: () => void;
  readonly isPublished?: boolean;
  readonly isPublishing?: boolean;
  readonly draftMode?: DraftMode;
}

export interface EditorHeaderProps {
  /** Entry title shown (and edited inline) in the header. */
  readonly title?: string;
  /** Persists a title edit; without it the title renders read-only. */
  readonly onTitleChange?: (title: string) => void;
  /** Returns to the entry list. */
  readonly onBack?: () => void;
  /** Publish / draft actions, pinned to the header's right edge. */
  readonly publish?: PublishActions;
  /** Shareable draft-preview URL ("View current draft"). */
  readonly previewLink?: string;
  /** Public permalink ("View live entry"); absent until first published. */
  readonly liveUrl?: string;
  /** Host-rendered "Revisions" affordance, placed after undo/redo. */
  readonly revisionsTrigger?: ReactNode;
}

export function EditorHeader({
  title,
  onTitleChange,
  onBack,
  publish,
  previewLink,
  liveUrl,
  revisionsTrigger,
}: EditorHeaderProps): ReactElement {
  const { i18n } = useLingui();
  const undoAvailable = useEditorStore((s) => s.canUndo);
  const redoAvailable = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setJsonOpen = useEditorStore((s) => s.setJsonOpen);

  return (
    <header
      className="bg-background flex h-(--header-height) shrink-0 items-center gap-2 border-b px-3"
      data-testid="plumix-editor-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            data-testid="plumix-editor-back"
            onClick={onBack}
            aria-label={i18n._({ id: "editor.header.back", message: "Back" })}
          >
            <ArrowLeft />
          </Button>
        ) : null}
        {title !== undefined ? (
          onTitleChange ? (
            <Input
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              data-testid="plumix-editor-title-input"
              aria-label={i18n._({
                id: "editor.header.title",
                message: "Title",
              })}
              variant="inline"
              className="h-8 max-w-md min-w-0"
              placeholder={i18n._({
                id: "editor.header.untitled",
                message: "Untitled",
              })}
            />
          ) : (
            <span
              className="truncate text-sm font-medium"
              data-testid="plumix-editor-title"
            >
              {title}
            </span>
          )
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="plumix-undo"
          disabled={!undoAvailable}
          onClick={undo}
          aria-label={i18n._({ id: "editor.toolbar.undo", message: "Undo" })}
        >
          <Undo2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="plumix-redo"
          disabled={!redoAvailable}
          onClick={redo}
          aria-label={i18n._({ id: "editor.toolbar.redo", message: "Redo" })}
        >
          <Redo2 />
        </Button>
        {revisionsTrigger}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="plumix-view-source"
          onClick={() => setJsonOpen(true)}
          aria-label={i18n._({
            id: "editor.header.source",
            message: "View source",
          })}
        >
          <Code2 />
        </Button>
        <PreviewMenu previewLink={previewLink} liveUrl={liveUrl} />
        {publish ? <HeaderPublish publish={publish} /> : null}
      </div>
    </header>
  );
}

// No Save action: autosave persists continuously, staging a draft for a
// published entry.
function HeaderPublish({
  publish,
}: {
  readonly publish: PublishActions;
}): ReactElement {
  const { draftMode } = publish;
  if (draftMode) {
    const busy =
      draftMode.isSaving || draftMode.isPublishing || draftMode.isDiscarding;
    return (
      <>
        {draftMode.hasPendingDraft ? (
          <>
            <span
              className="text-muted-foreground me-1 inline-flex items-center gap-1.5 text-xs"
              data-testid="editor-unpublished-changes"
            >
              <span className="bg-warning size-1.5 rounded-full" aria-hidden />
              <Trans
                id="editor.toolbar.unpublishedChanges"
                message="Unpublished changes"
              />
            </span>
            {/* Discarding drops the draft for good — it isn't a history step —
                so the button only asks. */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="editor-draft-discard"
                  disabled={busy}
                >
                  {draftMode.isDiscarding ? (
                    <Trans
                      id="editor.toolbar.discarding"
                      message="Discarding…"
                    />
                  ) : (
                    <Trans id="editor.toolbar.discard" message="Discard" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <Trans
                      id="editor.toolbar.discardConfirm.title"
                      message="Discard unpublished changes?"
                    />
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    <Trans
                      id="editor.toolbar.discardConfirm.description"
                      message="Every change since the last publish is removed, and the editor goes back to the published version. This can't be undone."
                    />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="editor-draft-discard-cancel">
                    <Trans
                      id="editor.toolbar.discardConfirm.cancel"
                      message="Keep editing"
                    />
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    data-testid="editor-draft-discard-confirm"
                    onClick={draftMode.onDiscardDraft}
                  >
                    <Trans
                      id="editor.toolbar.discardConfirm.confirm"
                      message="Discard changes"
                    />
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          data-testid="editor-draft-publish"
          disabled={busy || !draftMode.hasPendingDraft}
          onClick={draftMode.onPublishDraft}
        >
          <Trans id="editor.toolbar.publish" message="Publish" />
        </Button>
      </>
    );
  }
  const { isPublishing = false, isPublished = false } = publish;
  return (
    <Button
      type="button"
      size="sm"
      data-testid="plumix-editor-publish-button"
      disabled={isPublishing || isPublished}
      onClick={publish.onPublish}
    >
      <Trans id="editor.toolbar.publish" message="Publish" />
    </Button>
  );
}

function PreviewMenu({
  previewLink,
  liveUrl,
}: {
  readonly previewLink?: string;
  readonly liveUrl?: string;
}): ReactElement {
  const { i18n } = useLingui();
  const open = (url: string): void => {
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="plumix-preview-menu"
          aria-label={i18n._({
            id: "editor.header.preview",
            message: "Preview",
          })}
        >
          <Eye />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          data-testid="plumix-preview-draft"
          disabled={!previewLink}
          onSelect={() => previewLink && open(previewLink)}
        >
          <Pencil />
          <Trans id="editor.header.viewDraft" message="View current draft" />
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="plumix-preview-live"
          disabled={!liveUrl}
          onSelect={() => liveUrl && open(liveUrl)}
        >
          <Play />
          <Trans id="editor.header.viewLive" message="View live entry" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
