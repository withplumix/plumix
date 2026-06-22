import type { I18n } from "@lingui/core";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { useLingui } from "@lingui/react";

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

// Static ids (a switch, not a template literal) so the extractor catalogs them.
function deviceLabel(i18n: I18n, value: EditorDevice): string {
  switch (value) {
    case "tablet":
      return i18n._({ id: "editor.toolbar.device.tablet", message: "Tablet" });
    case "mobile":
      return i18n._({ id: "editor.toolbar.device.mobile", message: "Mobile" });
    default:
      return i18n._({
        id: "editor.toolbar.device.desktop",
        message: "Desktop",
      });
  }
}

/** Draft-mode actions for a published entry with a pending autosave. The host
 *  owns the mutations; the toolbar only renders the buttons and their state. */
interface DraftMode {
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

/** Canvas toolbar above the iframe: the rails toggle on the left, and the
 *  device/zoom controls centered over the canvas. Title, undo/redo, preview and
 *  publish live in the full-width header; blocks are added from the left rail. */
export function EditorToolbar(): ReactElement {
  return (
    <header
      className="bg-background flex items-center gap-2 border-b p-2"
      data-testid="plumix-editor-toolbar"
    >
      {/* Collapses both rails for a focused canvas (also Cmd/Ctrl+B). */}
      <SidebarTrigger data-testid="plumix-rails-toggle" className="shrink-0" />
      <div className="flex flex-1 justify-center">
        <DeviceZoomControls />
      </div>
      {/* Balances the rails toggle so the device/zoom cluster reads as centered. */}
      <div className="w-7 shrink-0" aria-hidden />
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
            aria-label={deviceLabel(i18n, value)}
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
