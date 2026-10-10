import type {
  CSSProperties,
  ReactElement,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useMemo, useRef } from "react";
import { useLingui } from "@lingui/react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@plumix/admin-ui/popover";
import { ScrollArea } from "@plumix/admin-ui/scroll-area";

import type { OverlayBox } from "./overlay.js";
import type { EditorDevice } from "./store.js";
import { BlockCatalog } from "./block-catalog-tab.js";
import { slotAllowedBlocks } from "./block-catalog.js";
import { findBlock } from "./block-tree-ops.js";
import { CANVAS_HEIGHT } from "./canvas-geometry.js";
import { stageTransform } from "./canvas-view.js";
import {
  clipboardOpFromEvent,
  createClipboardOps,
  pasteableAtRoot,
} from "./clipboard-ops.js";
import { connectCanvas } from "./connect-canvas.js";
import { useEditorConfig } from "./editor-config-context.js";
import { deviceLabel } from "./editor-toolbar.js";
import { overlayBox, px } from "./overlay.js";
import {
  useCameraStore,
  useCameraStoreApi,
  useEditorStore,
  useEditorStoreApi,
  useLoaderPushRef,
} from "./provider.js";
import { SelectionToolbar } from "./selection-toolbar.js";
import { deviceWidth } from "./store.js";
import { useCanvasDrag } from "./use-canvas-drag.js";
import { useCanvasGeometry } from "./use-canvas-geometry.js";
import { useCanvasKeys } from "./use-canvas-keys.js";
import { usePanZoom } from "./use-pan-zoom.js";

interface CanvasFrameProps {
  /** The entry's real route with `?plumix.edit`. */
  readonly previewUrl: string;
  readonly origin: string;
  readonly entryType?: string;
  readonly readOnly?: boolean;
  /**
   * Each bump reloads the iframe: entry fields live in the server-rendered
   * shell around the block island, which the bridge doesn't push.
   */
  readonly previewRefreshToken?: number;
}

const SELECTED_OUTLINE = "outline-canvas-selection";
const MEMBER_OUTLINE = "outline-canvas-selection/50";
const HOVER_OUTLINE = "outline-canvas-selection/40";

export function CanvasFrame({
  previewUrl,
  origin,
  entryType,
  readOnly = false,
  previewRefreshToken,
}: CanvasFrameProps): ReactElement {
  const { registry } = useEditorConfig();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const store = useEditorStoreApi();
  const camera = useCameraStoreApi();
  const clipboard = useMemo(
    () =>
      createClipboardOps(
        store,
        registry,
        navigator.clipboard,
        pasteableAtRoot(registry),
      ),
    [store, registry],
  );
  const loaderPushRef = useLoaderPushRef();
  const frameRequest = useEditorStore((s) => s.frameRequest);
  const device = useEditorStore((s) => s.device);
  const zoom = useCameraStore((s) => s.zoom);
  const panX = useCameraStore((s) => s.panX);
  const panY = useCameraStore((s) => s.panY);
  const breakpoints = useEditorStore((s) => s.breakpoints);
  const frameWidth = deviceWidth(device, breakpoints);
  const activeId = useEditorStore((s) => s.activeId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const hoverId = useEditorStore((s) => s.hoverId);
  const dragSpec = useEditorStore((s) => s.dragSpec);
  const movingId = useEditorStore((s) => s.movingId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // geometryRef is the shared substrate the gesture + drag hooks read.
  const { geometry, geometryRef, contentHeight, measureContent, applyReport } =
    useCanvasGeometry({ iframeRef, containerRef, frameWidth });
  // Reads geometryRef to clamp the frame; never writes it (no cycle).
  const {
    stageRef,
    gesturing,
    liveViewRef,
    panByClientDelta,
    commitLive,
    onHandlePointerDown,
    handleWheel,
    zoomToSelection,
    centerSelection,
  } = usePanZoom({ iframeRef, containerRef, geometryRef });
  const { panReady, keyHandlerRef } = useCanvasKeys({
    panByClientDelta,
    commitLive,
    zoomToSelection,
    liveViewRef,
  });
  const {
    dropY,
    dropSlot,
    refusedSlot,
    pendingAdd,
    setPendingAdd,
    requestAdd,
    rejection,
  } = useCanvasDrag({ iframeRef, geometryRef, registry });
  useEffect(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    const connection = connectCanvas({
      store,
      frameWindow,
      origin,
      onGeometry: applyReport,
      // Forwarded from the iframe: clientX/Y are iframe-local (unscaled), so
      // the cursor in container space is the frame's pan offset plus the scaled
      // local position.
      onWheel: ({ deltaX, deltaY, zoomIntent, clientX, clientY }) => {
        const { panX, panY, zoom } = camera.getState();
        handleWheel(
          deltaX,
          deltaY,
          zoomIntent,
          panX + clientX * zoom,
          panY + clientY * zoom,
        );
      },
      onKey: ({ down, code, shiftKey }) =>
        keyHandlerRef.current?.(down, code, shiftKey),
      onRequestAdd: ({ parentId, slotKey }) => requestAdd(parentId, slotKey),
      onClipboard: (op) => void clipboard.run(op),
      // The canvas has no i18n runtime. Not a dep: Lingui returns a fresh `{}`
      // for an unloaded locale, which would reconnect on every render.
      config: { locale, catalog: i18n.messages },
    });
    // Expose the loader-data push to the inspector's refresh control.
    if (loaderPushRef) loaderPushRef.current = connection.pushLoaderData;
    return () => {
      if (loaderPushRef) loaderPushRef.current = null;
      connection.dispose();
    };
  }, [
    store,
    camera,
    origin,
    applyReport,
    loaderPushRef,
    handleWheel,
    keyHandlerRef,
    requestAdd,
    i18n,
    locale,
    clipboard,
  ]);

  // Pans without zooming: a jump shouldn't also change the zoom.
  useEffect(() => {
    if (frameRequest === 0) return;
    centerSelection();
  }, [frameRequest, centerSelection]);

  // Safe: the WindowProxy survives a same-origin reload, so the bridge
  // re-handshakes and the host re-pushes the tree without losing edits.
  const reloadedTokenRef = useRef(previewRefreshToken);
  useEffect(() => {
    if (reloadedTokenRef.current === previewRefreshToken) return;
    reloadedTokenRef.current = previewRefreshToken;
    iframeRef.current?.contentWindow?.location.reload();
  }, [previewRefreshToken]);

  // Defers to native copy on a text selection and to fields while typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const op = clipboardOpFromEvent(e);
      if (!op) return;
      e.preventDefault();
      void clipboard.run(op);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clipboard]);

  // Overlays live in a clip layer pinned over the canvas viewport, so their
  // boxes are expressed relative to that layer's top-left (the container's
  // on-screen origin) rather than the whole window.
  const container = geometry.container;
  const activeRect = activeId ? geometry.rects.get(activeId) : undefined;
  const activeBox =
    activeRect && geometry.frame && container
      ? clipRelative(overlayBox(activeRect, geometry.frame, zoom), container)
      : null;

  const overlay = (
    id: string | null,
    outline: string,
    testId: string,
  ): ReactElement | null => {
    if (!id || !geometry.frame || !container) return null;
    const rect = geometry.rects.get(id);
    if (!rect) return null;
    const box = clipRelative(overlayBox(rect, geometry.frame, zoom), container);
    return (
      <div
        key={testId}
        data-testid={testId}
        className={`plumix-canvas-overlay pointer-events-none z-10 outline-2 ${outline}`}
        style={
          {
            "--box-left": px(box.left),
            "--box-top": px(box.top),
            "--box-width": px(box.width),
            "--box-height": px(box.height),
          } as CSSProperties
        }
      />
    );
  };

  // Inserter popover scope: a slot target carries both ids; the root document
  // carries neither (no allow-list — every block is offered).
  const pendingTarget =
    pendingAdd?.parentId && pendingAdd.slotKey
      ? { parentId: pendingAdd.parentId, slotKey: pendingAdd.slotKey }
      : undefined;
  const pendingParentName = pendingTarget
    ? findBlock(store.getState().tree, pendingTarget.parentId, registry)?.name
    : undefined;
  const pendingAllowed =
    pendingTarget && pendingParentName
      ? slotAllowedBlocks(registry, pendingParentName, pendingTarget.slotKey)
      : undefined;
  // Anchor the popover over the slot's on-screen box when we have its geometry;
  // fall back to the canvas box (root add, or a slot not yet measured).
  const pendingSlotRect =
    pendingTarget && geometry.frame
      ? geometry.slots.find(
          (s) =>
            s.parentId === pendingTarget.parentId &&
            s.slotKey === pendingTarget.slotKey,
        )
      : undefined;
  const pendingAnchor =
    pendingSlotRect && geometry.frame
      ? overlayBox(pendingSlotRect, geometry.frame, zoom)
      : container;

  return (
    <div
      ref={containerRef}
      data-testid="plumix-canvas-frame"
      // `touch-action:none` lets the stage own wheel/touch gestures.
      className={`bg-muted relative flex-1 touch-none overflow-hidden ${
        panReady ? "cursor-grab" : "cursor-default"
      }`}
    >
      {/* Overlays track the transform by re-reading the iframe's live rect. */}
      <div
        ref={stageRef}
        data-testid="plumix-canvas-stage"
        className="plumix-canvas-overlay origin-top-left transform-(--stage-transform)"
        style={
          {
            "--box-left": px(0),
            "--box-top": px(0),
            "--box-width": px(frameWidth),
            "--box-height": px(contentHeight ?? CANVAS_HEIGHT),
            // Committed transform. During a gesture the live transform is
            // written imperatively (applyLive) and re-asserted after any
            // incidental render by the layout effect below, so this stale
            // value never paints.
            "--stage-transform": stageTransform({ panX, panY, zoom }),
          } as CSSProperties
        }
      >
        {!readOnly && (
          <CanvasHandle device={device} onPointerDown={onHandlePointerDown} />
        )}
        <iframe
          ref={iframeRef}
          src={previewUrl}
          title="plumix-editor-canvas"
          onLoad={measureContent}
          // Click-through while a block drag or a space-pan is active so the
          // host receives the pointer events. Single declarative owner — no
          // imperative toggling that could desync across the two gestures.
          className={`block size-full border-0 ${
            dragSpec || movingId || panReady ? "pointer-events-none" : ""
          }`}
        />
      </div>
      {/* Hidden mid-gesture: overlays read stale geometry while the transform is
          live, and re-measuring per frame is too costly. */}
      {!readOnly && container && !gesturing && (
        <div
          data-testid="plumix-overlay-clip"
          className="plumix-canvas-overlay pointer-events-none fixed z-10 overflow-hidden"
          style={
            {
              "--box-left": px(container.left),
              "--box-top": px(container.top),
              "--box-width": px(container.width),
              "--box-height": px(container.height),
            } as CSSProperties
          }
        >
          {overlay(hoverId, HOVER_OUTLINE, "plumix-overlay-hover")}
          {[...selectedIds]
            .filter((id) => id !== activeId)
            .map((id) =>
              overlay(id, MEMBER_OUTLINE, `plumix-overlay-member-${id}`),
            )}
          {overlay(activeId, SELECTED_OUTLINE, "plumix-overlay-selected")}
          {activeBox && <SelectionToolbar box={activeBox} />}
          {dropSlot && (
            <div
              data-testid="plumix-slot-drop-indicator"
              className={`plumix-canvas-overlay bg-canvas-selection/8 pointer-events-none z-20 outline-2 outline-dashed ${SELECTED_OUTLINE}`}
              style={
                {
                  "--box-left": px(dropSlot.box.left - container.left),
                  "--box-top": px(dropSlot.box.top - container.top),
                  "--box-width": px(dropSlot.box.width),
                  "--box-height": px(dropSlot.box.height),
                } as CSSProperties
              }
            />
          )}
          {refusedSlot && (
            <div
              role="status"
              data-testid="plumix-slot-refused-indicator"
              className="plumix-canvas-overlay bg-destructive/8 outline-destructive pointer-events-none z-20 outline-2 outline-dashed"
              style={
                {
                  "--box-left": px(refusedSlot.box.left - container.left),
                  "--box-top": px(refusedSlot.box.top - container.top),
                  "--box-width": px(refusedSlot.box.width),
                  "--box-height": px(refusedSlot.box.height),
                } as CSSProperties
              }
            >
              <span className="sr-only">
                {i18n._({
                  id: "editor.canvas.slotRefusesBlock",
                  message: "This block can't be placed in this slot.",
                })}
              </span>
            </div>
          )}
          {dropY !== null && geometry.frame && (
            <div
              data-testid="plumix-drop-indicator"
              className="plumix-canvas-overlay bg-canvas-selection pointer-events-none z-20 h-0.5"
              style={
                {
                  "--box-left": px(geometry.frame.left - container.left),
                  "--box-top": px(dropY - container.top),
                  "--box-width": px(frameWidth * zoom),
                } as CSSProperties
              }
            />
          )}
        </div>
      )}

      {!readOnly && pendingAdd && (
        <Popover
          open
          onOpenChange={(next) => {
            if (!next) setPendingAdd(null);
          }}
        >
          <PopoverAnchor asChild>
            <div
              className="plumix-canvas-overlay pointer-events-none fixed"
              style={
                {
                  "--box-left": px(pendingAnchor?.left ?? 0),
                  "--box-top": px(pendingAnchor?.top ?? 0),
                  "--box-width": px(pendingAnchor?.width ?? 0),
                  "--box-height": px(pendingAnchor?.height ?? 0),
                } as CSSProperties
              }
            />
          </PopoverAnchor>
          <PopoverContent
            data-testid="plumix-inserter-popover"
            align="start"
            variant="flush"
            className="w-72"
          >
            {/* Radix's viewport (height:100%) won't clamp to a max-height on
                the Root, so cap the viewport directly — it then scrolls while
                the popover still shrinks to fit short lists. */}
            <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-96">
              <BlockCatalog
                allowed={pendingAllowed}
                parentName={pendingParentName}
                target={pendingTarget}
                entryType={entryType}
                onInsert={() => setPendingAdd(null)}
              />
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}

      {/* Transient "can't place here" notice for a refused requiresParent drop;
          the editor has no toast surface, so it shows inline. */}
      {!readOnly && rejection && (
        <div
          role="status"
          data-testid="plumix-add-rejection"
          className="bg-destructive pointer-events-none absolute inset-x-0 bottom-4 z-30 mx-auto w-fit rounded-md px-3 py-2 text-xs text-white shadow-md"
        >
          {rejection}
        </div>
      )}
    </div>
  );
}

function CanvasHandle({
  device,
  onPointerDown,
}: {
  readonly device: EditorDevice;
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}): ReactElement {
  const { i18n } = useLingui();
  return (
    <div
      data-testid="plumix-canvas-handle"
      onPointerDown={onPointerDown}
      title={i18n._({
        id: "editor.canvas.pan",
        message: "Drag to move the canvas",
      })}
      className="bg-background text-foreground absolute inset-x-0 -top-10 flex h-8 cursor-grab touch-none items-center px-4 text-sm font-medium select-none active:cursor-grabbing"
    >
      {deviceLabel(i18n, device)}
    </div>
  );
}

/** Shift a window-space overlay box into the clip layer's local space. */
function clipRelative(box: OverlayBox, container: OverlayBox): OverlayBox {
  return {
    ...box,
    left: box.left - container.left,
    top: box.top - container.top,
  };
}
