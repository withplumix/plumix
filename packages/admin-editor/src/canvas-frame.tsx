import type { ReactElement, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLingui } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@plumix/admin-ui/popover";
import { ScrollArea } from "@plumix/admin-ui/scroll-area";

import type { Geometry } from "./canvas-geometry.js";
import type { OverlayBox } from "./overlay.js";
import type { EditorDevice } from "./store.js";
import { BlockCatalog } from "./block-catalog-tab.js";
import { slotAllowedBlocks } from "./block-catalog.js";
import { findBlock } from "./block-tree-ops.js";
import { clampPanToFrame, fitView } from "./canvas-view.js";
import {
  clipboardOpFromEvent,
  createClipboardOps,
  pasteableAtRoot,
} from "./clipboard-ops.js";
import { connectCanvas } from "./connect-canvas.js";
import { deviceLabel } from "./editor-toolbar.js";
import { overlayBox } from "./overlay.js";
import {
  useEditorStore,
  useEditorStoreApi,
  useLoaderPushRef,
} from "./provider.js";
import { SelectionToolbar } from "./selection-toolbar.js";
import { deviceWidth } from "./store.js";
import { useCanvasDrag } from "./use-canvas-drag.js";
import { useCanvasKeys } from "./use-canvas-keys.js";
import { usePanZoom } from "./use-pan-zoom.js";

interface CanvasFrameProps {
  /** URL the iframe loads — the entry's real route with `?plumix.edit`. */
  readonly previewUrl: string;
  /** Origin of that route, for bridge message pinning. */
  readonly origin: string;
  /** Catalog for the empty-state affordance's default block. */
  readonly registry: BlockRegistry;
  /** Viewer capabilities, gating which block the empty state inserts. */
  readonly capabilities: ReadonlySet<string>;
  /** Preview mode: still render the pushed tree, but draw no selection /
   *  hover overlays, toolbar, drop indicators, or empty-state affordance. */
  readonly readOnly?: boolean;
}

const SELECTED_OUTLINE = "#2563eb";
const MEMBER_OUTLINE = "rgba(37,99,235,0.5)";
const HOVER_OUTLINE = "rgba(37,99,235,0.4)";
const CANVAS_HEIGHT = 800;

/**
 * Host-side canvas: loads the real route in an iframe, drives it via the
 * bridge, draws selection/hover overlays in the shell's coordinate space, and
 * resolves catalog drags into top-level inserts (a drop indicator follows the
 * pointer; releasing over the canvas inserts at that position).
 */
export function CanvasFrame({
  previewUrl,
  origin,
  registry,
  capabilities,
  readOnly = false,
}: CanvasFrameProps): ReactElement {
  const { i18n } = useLingui();
  // The canvas has no i18n runtime, so resolve its chrome (the in-canvas "Add a
  // block" affordance, root + empty slots) here and push it over the bridge.
  const addBlockLabel = i18n._({
    id: "editor.canvas.addBlock",
    message: "Add a block",
  });
  const store = useEditorStoreApi();
  const clipboard = useMemo(
    () =>
      createClipboardOps(store, navigator.clipboard, pasteableAtRoot(registry)),
    [store, registry],
  );
  const loaderPushRef = useLoaderPushRef();
  const device = useEditorStore((s) => s.device);
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const breakpoints = useEditorStore((s) => s.breakpoints);
  const zoomFit = useEditorStore((s) => s.zoomFit);
  const frameWidth = deviceWidth(device, breakpoints);
  const activeId = useEditorStore((s) => s.activeId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const hoverId = useEditorStore((s) => s.hoverId);
  const dragSpec = useEditorStore((s) => s.dragSpec);
  const movingId = useEditorStore((s) => s.movingId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry>({
    rects: new Map(),
    slots: [],
    frame: null,
    container: null,
  });
  // Mirror geometry for the drag handler so it reads fresh rects without
  // re-subscribing the window listeners on every geometry report.
  const geometryRef = useRef<Geometry>(geometry);
  // The pannable/zoomable stage: transform writes + gesture lifecycle. Reads
  // container geometry to clamp the frame; never writes geometry.
  const {
    stageRef,
    gesturing,
    liveViewRef,
    panByClientDelta,
    commitLive,
    onHandlePointerDown,
    handleWheel,
    zoomToSelection,
  } = usePanZoom({ iframeRef, containerRef, geometryRef });
  // Space-to-pan + view shortcuts; `keyHandlerRef` is fed forwarded keys by the
  // bridge, `panReady` gates the grab cursor + iframe click-through.
  const { panReady, keyHandlerRef } = useCanvasKeys({
    panByClientDelta,
    commitLive,
    zoomToSelection,
    liveViewRef,
  });
  // Catalog/move drag → placement resolution + insert, the in-canvas inserter
  // popover, and the transient "can't place here" notice.
  const { dropY, dropSlot, pendingAdd, setPendingAdd, requestAdd, rejection } =
    useCanvasDrag({ iframeRef, geometryRef, registry });
  // The iframe's own document height (same-origin), so the frame sizes to its
  // content — footer visible, no fixed gap below it.
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const measureContent = useCallback((): void => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) setContentHeight(doc.documentElement.scrollHeight);
  }, []);

  // The iframe's on-screen offset and the canvas viewport box, read live from
  // the DOM. These move on scroll, window resize, and rail collapse — none of
  // which re-fire the iframe's tree-keyed geometry report — so they're measured
  // here and refreshed by the observer effect below, not just on block reports.
  const measureHost = useCallback((): Pick<Geometry, "frame" | "container"> => {
    const rect = iframeRef.current?.getBoundingClientRect();
    const box = containerRef.current?.getBoundingClientRect();
    return {
      frame: rect ? { left: rect.left, top: rect.top } : null,
      container: box
        ? { left: box.left, top: box.top, width: box.width, height: box.height }
        : null,
    };
  }, []);

  useEffect(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    const connection = connectCanvas({
      store,
      frameWindow,
      origin,
      onGeometry: (reported, slots) => {
        const next: Geometry = {
          rects: new Map(reported.map((r) => [r.id, r])),
          slots,
          ...measureHost(),
        };
        geometryRef.current = next;
        setGeometry(next);
        // A fresh geometry report follows a tree change, so the document height
        // may have shifted too.
        measureContent();
      },
      // Forwarded from the iframe: clientX/Y are iframe-local (unscaled), so the
      // cursor in container space is the frame's pan offset plus the scaled
      // local position.
      onWheel: ({ deltaX, deltaY, zoomIntent, clientX, clientY }) => {
        const { panX, panY, zoom } = store.getState();
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
      config: { addBlockLabel },
    });
    // Expose the loader-data push to the inspector's refresh control.
    if (loaderPushRef) loaderPushRef.current = connection.pushLoaderData;
    return () => {
      if (loaderPushRef) loaderPushRef.current = null;
      connection.dispose();
    };
  }, [
    store,
    origin,
    measureHost,
    measureContent,
    loaderPushRef,
    handleWheel,
    keyHandlerRef,
    requestAdd,
    addBlockLabel,
    clipboard,
  ]);

  // Block clipboard shortcuts while focus is on the host chrome (the iframe
  // forwards its own via the bridge). Defers to native copy on a text selection
  // and to fields while typing.
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

  // Keep frame/container fresh when the canvas moves without a block report:
  // column scroll, window resize, and rail collapse (which resizes the inset).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const refresh = (): void => {
      const next = { ...geometryRef.current, ...measureHost() };
      geometryRef.current = next;
      setGeometry(next);
    };
    el.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(refresh);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
      observer?.disconnect();
    };
  }, [measureHost]);

  // Fit-and-center: while in fit mode, scale the frame to the viewport width
  // (never past 100%) AND center it. This is what a device switch lands on
  // (setDevice re-enables fit), so the frame is always on-screen and centered
  // instead of pinned to the top-left. A manual pan/zoom leaves fit mode.
  const containerWidth = geometry.container?.width;
  const containerHeight = geometry.container?.height;
  useEffect(() => {
    if (!zoomFit || !containerWidth || !containerHeight) return;
    const next = fitView(
      frameWidth,
      contentHeight ?? CANVAS_HEIGHT,
      containerWidth,
      containerHeight,
    );
    const s = store.getState();
    if (s.zoom !== next.zoom || s.panX !== next.panX || s.panY !== next.panY) {
      s.applyFitView(next);
    }
  }, [
    zoomFit,
    frameWidth,
    contentHeight,
    containerWidth,
    containerHeight,
    store,
  ]);

  // The stage transform moves the iframe without firing scroll, so re-measure
  // the frame/container rects after a pan/zoom paints — the overlays read the
  // iframe's live on-screen box and must track it.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const next = { ...geometryRef.current, ...measureHost() };
      geometryRef.current = next;
      setGeometry(next);
      // Keep the frame reachable after a manual zoom (e.g. the toolbar +/-,
      // which zoom from the center and could otherwise drift it off-stage). The
      // fit effect owns pan while in fit mode, so only clamp manual views.
      const iframe = iframeRef.current;
      const s = store.getState();
      if (next.container && iframe && !s.zoomFit) {
        const r = iframe.getBoundingClientRect();
        const p = clampPanToFrame(
          s.panX,
          s.panY,
          r.width,
          r.height,
          next.container.width,
          next.container.height,
        );
        if (p.panX !== s.panX || p.panY !== s.panY) s.setPan(p.panX, p.panY);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [panX, panY, zoom, frameWidth, contentHeight, measureHost, store]);

  // Mirror the viewport size into the store so toolbar zoom-to-center has the
  // dims it needs without reaching into the DOM.
  useEffect(() => {
    if (containerWidth && containerHeight) {
      store.getState().setViewport(containerWidth, containerHeight);
    }
  }, [containerWidth, containerHeight, store]);

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
    color: string,
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
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          outline: `2px solid ${color}`,
          pointerEvents: "none",
          zIndex: 10,
        }}
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
    ? findBlock(store.getState().tree, pendingTarget.parentId)?.name
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
      // A Figma-style pannable stage: the device frame floats in this surface
      // and is panned/zoomed via a transform (no scrollbars). `overflow:hidden`
      // clips the off-stage frame; `touch-action:none` lets us own wheel/touch
      // gestures. `var(--muted)` reads as canvas, not a void.
      style={{
        position: "relative",
        flex: 1,
        overflow: "hidden",
        touchAction: "none",
        background: "var(--muted)",
        cursor: panReady ? "grab" : "default",
      }}
    >
      {/* The stage: positioned at the container origin and moved as a whole by
          `translate(pan) scale(zoom)`. The iframe sits at natural size; the
          transform does the panning + zooming, and the overlays track it by
          re-reading the iframe's live on-screen rect. */}
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: frameWidth,
          height: contentHeight ?? CANVAS_HEIGHT,
          // Committed transform. During a gesture the live transform is written
          // imperatively (applyLive) and re-asserted after any incidental render
          // by the layout effect below, so this stale value never paints.
          transform: `translate(${String(panX)}px, ${String(panY)}px) scale(${String(zoom)})`,
          transformOrigin: "top left",
        }}
      >
        {!readOnly && (
          <CanvasHandle
            device={device}
            frameWidth={frameWidth}
            onPointerDown={onHandlePointerDown}
          />
        )}
        <iframe
          ref={iframeRef}
          src={previewUrl}
          title="plumix-editor-canvas"
          onLoad={measureContent}
          style={{
            display: "block",
            width: frameWidth,
            height: contentHeight ?? CANVAS_HEIGHT,
            border: 0,
            // Click-through while a block drag or a space-pan is active so the
            // host receives the pointer events. Single declarative owner — no
            // imperative toggling that could desync across the two gestures.
            pointerEvents:
              dragSpec || movingId || panReady ? "none" : undefined,
          }}
        />
      </div>
      {/* Clip layer pinned over the visible canvas column. Its overflow:hidden
          keeps the absolutely-positioned overlays + toolbar from spilling onto
          the side rails when the iframe renders wider than the column. Hidden
          mid-gesture: the overlays read stale geometry while the transform is
          live, and re-measuring per frame is the cost we're avoiding. They snap
          back on commit. */}
      {!readOnly && container && !gesturing && (
        <div
          data-testid="plumix-overlay-clip"
          style={{
            position: "fixed",
            left: container.left,
            top: container.top,
            width: container.width,
            height: container.height,
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 10,
          }}
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
              style={{
                position: "absolute",
                left: dropSlot.box.left - container.left,
                top: dropSlot.box.top - container.top,
                width: dropSlot.box.width,
                height: dropSlot.box.height,
                outline: `2px dashed ${SELECTED_OUTLINE}`,
                background: "rgba(37,99,235,0.08)",
                pointerEvents: "none",
                zIndex: 20,
              }}
            />
          )}
          {dropY !== null && geometry.frame && (
            <div
              data-testid="plumix-drop-indicator"
              style={{
                position: "absolute",
                left: geometry.frame.left - container.left,
                top: dropY - container.top,
                width: frameWidth * zoom,
                height: 2,
                background: SELECTED_OUTLINE,
                pointerEvents: "none",
                zIndex: 20,
              }}
            />
          )}
        </div>
      )}

      {/* Slot-scoped inserter: opened by the in-canvas "Add a block" affordance,
          anchored over the slot, listing only that slot's permitted blocks. A
          pick inserts into the slot (or at the root) and closes it. */}
      {!readOnly && pendingAdd && (
        <Popover
          open
          onOpenChange={(next) => {
            if (!next) setPendingAdd(null);
          }}
        >
          <PopoverAnchor
            style={{
              position: "fixed",
              left: pendingAnchor?.left ?? 0,
              top: pendingAnchor?.top ?? 0,
              width: pendingAnchor?.width ?? 0,
              height: pendingAnchor?.height ?? 0,
              pointerEvents: "none",
            }}
          />
          <PopoverContent
            data-testid="plumix-inserter-popover"
            align="start"
            className="w-72 p-0"
          >
            {/* Radix's viewport (height:100%) won't clamp to a max-height on
                the Root, so cap the viewport directly — it then scrolls while
                the popover still shrinks to fit short lists. */}
            <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-96">
              <BlockCatalog
                registry={registry}
                capabilities={capabilities}
                allowed={pendingAllowed}
                parentName={pendingParentName}
                target={pendingTarget}
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
          style={{
            position: "absolute",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            zIndex: 30,
            padding: "0.5rem 0.75rem",
            borderRadius: 8,
            fontSize: "0.8125rem",
            color: "var(--destructive-foreground, #fff)",
            background: "var(--destructive, #dc2626)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            pointerEvents: "none",
          }}
        >
          {rejection}
        </div>
      )}
    </div>
  );
}

// The strip lives inside the stage (so it pans/zooms with the frame), offset up
// by its own height plus a gap to clear the frame's top edge.
const HANDLE_HEIGHT = 32;
const HANDLE_GAP = 8;

/** The draggable device-label strip that rides just above the device frame. */
function CanvasHandle({
  device,
  frameWidth,
  onPointerDown,
}: {
  readonly device: EditorDevice;
  readonly frameWidth: number;
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
      className="bg-background text-foreground flex cursor-grab items-center px-4 text-sm font-medium select-none active:cursor-grabbing"
      style={{
        position: "absolute",
        left: 0,
        top: -(HANDLE_HEIGHT + HANDLE_GAP),
        width: frameWidth,
        height: HANDLE_HEIGHT,
        touchAction: "none",
      }}
    >
      {deviceLabel(i18n, device)}
    </div>
  );
}

// Shift a window-space overlay box into the clip layer's local space.
function clipRelative(box: OverlayBox, container: OverlayBox): OverlayBox {
  return {
    ...box,
    left: box.left - container.left,
    top: box.top - container.top,
  };
}
