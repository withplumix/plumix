import type { ReactElement } from "react";
import { Trans, useLingui } from "@lingui/react";

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

import type { PublishActions } from "./editor-toolbar.js";
import { canRedo, canUndo } from "./history.js";
import { useEditorStore } from "./provider.js";

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
}

/**
 * Full-width editor header: a back button + inline-editable entry title on the
 * left; undo/redo, a preview menu, and the publish actions on the right. Spans
 * the whole editor (above both side rails), unlike the canvas toolbar.
 */
export function EditorHeader({
  title,
  onTitleChange,
  onBack,
  publish,
  previewLink,
  liveUrl,
}: EditorHeaderProps): ReactElement {
  const { i18n } = useLingui();
  const undoAvailable = useEditorStore((s) => canUndo(s.history));
  const redoAvailable = useEditorStore((s) => canRedo(s.history));
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
              className="hover:bg-accent focus-visible:bg-background h-8 max-w-md min-w-0 border-transparent bg-transparent text-sm font-medium shadow-none"
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

/** A single Publish button. Drafts of an already-published entry stage via
 *  autosave, so the header shows no separate save/discard — just Publish. */
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
      <Button
        type="button"
        size="sm"
        data-testid="editor-draft-publish"
        disabled={busy || !draftMode.hasPendingDraft}
        onClick={draftMode.onPublishDraft}
      >
        <Trans id="editor.toolbar.publish" message="Publish" />
      </Button>
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

/** Eye-icon menu: open the current draft preview or the published page. The
 *  live entry is disabled until the entry has been published at least once. */
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
