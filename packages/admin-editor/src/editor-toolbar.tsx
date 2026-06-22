import type { ReactElement, ReactNode } from "react";
import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";
import {
  Monitor,
  Smartphone,
  Tablet,
  ZoomIn,
  ZoomOut,
} from "@plumix/admin-ui/icons";
import { SidebarTrigger } from "@plumix/admin-ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@plumix/admin-ui/toggle-group";

import type { EditorDevice } from "./store.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const DEVICES: readonly {
  readonly value: EditorDevice;
  readonly Icon: typeof Monitor;
}[] = [
  { value: "desktop", Icon: Monitor },
  { value: "tablet", Icon: Tablet },
  { value: "mobile", Icon: Smartphone },
];

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

/** Canvas toolbar above the iframe: the rails toggle + inline inserter on the
 *  left, and the device/zoom controls centered over the canvas. Title, undo/
 *  redo, preview and publish live in the full-width header instead. */
export function EditorToolbar({
  inserter,
}: {
  readonly inserter?: ReactNode;
}): ReactElement {
  return (
    <header
      className="bg-background flex items-center gap-2 border-b p-2"
      data-testid="plumix-editor-toolbar"
    >
      <div className="flex shrink-0 items-center gap-1">
        {/* Collapses both rails for a focused canvas (also Cmd/Ctrl+B). */}
        <SidebarTrigger data-testid="plumix-rails-toggle" />
        {inserter}
      </div>
      <div className="flex flex-1 justify-center">
        <DeviceZoomControls />
      </div>
      {/* Balances the left group so the device/zoom cluster reads as centered. */}
      <div className="w-8 shrink-0" aria-hidden />
    </header>
  );
}

/** Device switch (sizing the canvas to the theme's breakpoint widths) plus zoom
 *  out/in and a percent readout that doubles as the fit-to-width action. */
function DeviceZoomControls(): ReactElement {
  const { i18n } = useLingui();
  const device = useEditorStore((s) => s.device);
  const zoom = useEditorStore((s) => s.zoom);
  const setDevice = useEditorStore((s) => s.setDevice);
  const setZoom = useEditorStore((s) => s.setZoom);
  const enableZoomFit = useEditorStore((s) => s.enableZoomFit);

  const zoomOut = (): void =>
    setZoom([...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.01) ?? zoom);
  const zoomIn = (): void =>
    setZoom(ZOOM_STEPS.find((s) => s > zoom + 0.01) ?? zoom);

  return (
    <div
      className="flex items-center gap-1"
      data-testid="plumix-canvas-controls"
    >
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={device}
        onValueChange={(value) => {
          if (value) setDevice(value as EditorDevice);
        }}
      >
        {DEVICES.map(({ value, Icon }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            data-testid={`plumix-device-${value}`}
            aria-label={i18n._({
              id: `editor.toolbar.device.${value}`,
              message: value,
            })}
          >
            <Icon />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-testid="plumix-zoom-out"
        onClick={zoomOut}
        aria-label={i18n._({
          id: "editor.toolbar.zoomOut",
          message: "Zoom out",
        })}
      >
        <ZoomOut />
      </Button>
      <button
        type="button"
        data-testid="plumix-zoom-percent"
        onClick={enableZoomFit}
        className="text-muted-foreground hover:text-foreground w-12 text-center text-xs tabular-nums"
        title={i18n._({
          id: "editor.toolbar.fitWidth",
          message: "Fit to width",
        })}
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-testid="plumix-zoom-in"
        onClick={zoomIn}
        aria-label={i18n._({ id: "editor.toolbar.zoomIn", message: "Zoom in" })}
      >
        <ZoomIn />
      </Button>
    </div>
  );
}

export function PublishControls({
  publish,
}: {
  readonly publish: PublishActions;
}): ReactElement {
  const { draftMode } = publish;
  if (draftMode) {
    const busy =
      draftMode.isSaving || draftMode.isPublishing || draftMode.isDiscarding;
    return (
      <div className="flex shrink-0 items-center gap-2">
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
    <div className="shrink-0">
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
