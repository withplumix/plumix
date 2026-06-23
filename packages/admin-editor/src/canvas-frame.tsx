import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import type { BlockRect, SlotRect } from "@plumix/blocks/renderer";

import type { FrameOffset, OverlayBox } from "./overlay.js";
import {
  createNodeFromEntry,
  groupInsertables,
  slotAllowedBlocks,
} from "./block-catalog.js";
import { findBlock } from "./block-tree-ops.js";
import {
  clampPanToFrame,
  clampZoom,
  fitView,
  frameSelection,
  zoomToCursor,
} from "./canvas-view.js";
import { connectCanvas } from "./connect-canvas.js";
import { dropPlacement } from "./drop-index.js";
import { overlayBox } from "./overlay.js";
import {
  useEditorStore,
  useEditorStoreApi,
  useLoaderPushRef,
} from "./provider.js";
import { SelectionToolbar } from "./selection-toolbar.js";
import { deviceWidth } from "./store.js";

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

interface Geometry {
  readonly rects: ReadonlyMap<string, BlockRect>;
  /** Container slot regions (iframe coords), for resolving nested drops. */
  readonly slots: readonly SlotRect[];
  /** The iframe's on-screen offset, for mapping block rects to overlay boxes. */
  readonly frame: FrameOffset | null;
  /** The canvas viewport's on-screen box — overlays clip to this so they never
   *  spill over the side rails (the iframe renders wider than the column). */
  readonly container: OverlayBox | null;
}

/** A resolved nested-drop target: which slot, and its on-screen box. */
interface SlotDrop {
  readonly parentId: string;
  readonly slotKey: string;
  readonly box: OverlayBox;
}

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
  const store = useEditorStoreApi();
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
  const isEmpty = useEditorStore((s) => s.tree.length === 0);
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
  // Space held → ready to pan-drag (grab cursor; the iframe goes click-through
  // so the host receives the drag).
  const [panReady, setPanReady] = useState(false);
  // Latest key handler, so the bridge's forwarded keys (iframe focus) and the
  // window listener (shell focus) both reach the same logic without
  // re-subscribing the bridge.
  const keyHandlerRef = useRef<
    ((down: boolean, code: string, shiftKey: boolean) => void) | null
  >(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<SlotDrop | null>(null);
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

  // The free-canvas pan/zoom gesture, shared by the host's own wheel (over the
  // margins) and the iframe-forwarded wheel (over the canvas). `cx/cy` are the
  // cursor in container space. Reads live state so the bridge wiring stays
  // subscribed once; scaled frame dims come straight off the iframe rect.
  const handleWheel = useCallback(
    (
      deltaX: number,
      deltaY: number,
      zoomIntent: boolean,
      cx: number,
      cy: number,
    ): void => {
      const iframe = iframeRef.current;
      const box = geometryRef.current.container;
      if (!iframe || !box) return;
      const rect = iframe.getBoundingClientRect();
      const { panX, panY, zoom } = store.getState();
      if (zoomIntent) {
        const nextZoom = clampZoom(zoom * Math.exp(-deltaY * 0.0015));
        if (nextZoom === zoom) return;
        // Zoom toward the cursor, then clamp so the frame stays reachable.
        const view = zoomToCursor({ zoom, panX, panY }, nextZoom, cx, cy);
        const baseW = rect.width / zoom;
        const baseH = rect.height / zoom;
        store.getState().setView({
          zoom: view.zoom,
          ...clampPanToFrame(
            view.panX,
            view.panY,
            baseW * view.zoom,
            baseH * view.zoom,
            box.width,
            box.height,
          ),
        });
      } else {
        const p = clampPanToFrame(
          panX - deltaX,
          panY - deltaY,
          rect.width,
          rect.height,
          box.width,
          box.height,
        );
        store.getState().setPan(p.panX, p.panY);
      }
    },
    [store],
  );

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
    });
    // Expose the loader-data push to the inspector's refresh control.
    if (loaderPushRef) loaderPushRef.current = connection.pushLoaderData;
    return () => {
      if (loaderPushRef) loaderPushRef.current = null;
      connection.dispose();
    };
  }, [store, origin, measureHost, measureContent, loaderPushRef, handleWheel]);

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

  // Frame the active block in the viewport (Shift+2) — the move that makes a
  // free canvas genuinely better for editing, not just nicer to look at.
  const zoomToSelection = useCallback((): void => {
    const s = store.getState();
    const box = geometryRef.current.container;
    const rect = s.activeId
      ? geometryRef.current.rects.get(s.activeId)
      : undefined;
    if (!box || !rect || rect.width === 0 || rect.height === 0) return;
    s.setView(frameSelection(rect, box.width, box.height));
  }, [store]);

  // Space-to-pan + view shortcuts. Keys arrive natively (shell focus) and
  // forwarded from the iframe (canvas focus) — both routed through one handler.
  useEffect(() => {
    let spaceHeld = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;
    // The iframe's click-through is owned declaratively by the render (it's
    // none while a block drag OR a space-pan is active), so this just tracks
    // the space state — no imperative pointerEvents toggling to desync.
    const exitPan = (): void => {
      spaceHeld = false;
      dragging = false;
      setPanReady(false);
    };
    const handleKey = (
      down: boolean,
      code: string,
      shiftKey: boolean,
    ): void => {
      if (!down) {
        if (code === "Space") exitPan();
        return;
      }
      if (code === "Space") {
        if (!spaceHeld) {
          spaceHeld = true;
          setPanReady(true);
        }
        return;
      }
      if (!shiftKey) return;
      if (code === "Digit1") store.getState().enableZoomFit();
      else if (code === "Digit2") zoomToSelection();
      else if (code === "Digit0") store.getState().zoomToCenter(1);
    };
    keyHandlerRef.current = handleKey;

    const isTyping = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const isViewKey = (e: KeyboardEvent): boolean =>
      e.code === "Space" ||
      (e.shiftKey &&
        (e.code === "Digit0" || e.code === "Digit1" || e.code === "Digit2"));
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTyping(e.target) || !isViewKey(e)) return;
      if (e.code === "Space") e.preventDefault();
      handleKey(true, e.code, e.shiftKey);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === "Space") handleKey(false, e.code, false);
    };
    const onPointerDown = (e: PointerEvent): void => {
      if (!spaceHeld) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const s = store.getState();
      startPanX = s.panX;
      startPanY = s.panY;
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!dragging) return;
      const box = geometryRef.current.container;
      const iframe = iframeRef.current;
      if (!box || !iframe) return;
      const r = iframe.getBoundingClientRect();
      const p = clampPanToFrame(
        startPanX + (e.clientX - startX),
        startPanY + (e.clientY - startY),
        r.width,
        r.height,
        box.width,
        box.height,
      );
      store.getState().setPan(p.panX, p.panY);
    };
    const onPointerUp = (): void => {
      dragging = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      keyHandlerRef.current = null;
      exitPan();
    };
  }, [store, zoomToSelection]);

  // Canvas drag, shared by two sources: a catalog block being inserted
  // (dragSpec) and an existing block being moved (movingId). The iframe is
  // click-through while dragging (owned by the render) so the host receives the
  // pointer events; the target is computed from the reported block + slot
  // geometry mapped into screen space.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const draggingName =
      dragSpec?.name ??
      (movingId ? findBlock(store.getState().tree, movingId)?.name : undefined);
    if (!draggingName) return;

    const endDrag = (): void => {
      if (dragSpec) store.getState().endBlockDrag();
      else store.getState().endMove();
    };
    const allowedForSlot = (slot: SlotDrop): readonly string[] | undefined => {
      const parent = findBlock(store.getState().tree, slot.parentId);
      return parent
        ? slotAllowedBlocks(registry, parent.name, slot.slotKey)
        : undefined;
    };

    const placementAt = (clientX: number, clientY: number) => {
      const rect = iframe.getBoundingClientRect();
      const over =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      if (!over) return null;
      const frame: FrameOffset = { left: rect.left, top: rect.top };
      const { tree, zoom: z } = store.getState();
      const spans = tree.flatMap((node) => {
        const r = geometryRef.current.rects.get(node.id);
        if (!r) return [];
        const box = overlayBox(r, frame, z);
        return [{ y: box.top, height: box.height }];
      });
      return dropPlacement(spans, clientY);
    };

    // The innermost slot under the pointer that accepts the dragged block — a
    // nested drop target. Innermost (smallest box) wins so a slot inside a slot
    // is reachable; allowedBlocks gates which slots even light up.
    const slotTargetAt = (
      clientX: number,
      clientY: number,
    ): SlotDrop | null => {
      const rect = iframe.getBoundingClientRect();
      const frame: FrameOffset = { left: rect.left, top: rect.top };
      const { tree, zoom: z } = store.getState();
      let best: SlotDrop | null = null;
      let bestArea = Infinity;
      for (const slot of geometryRef.current.slots) {
        const box = overlayBox(slot, frame, z);
        if (
          clientX < box.left ||
          clientX > box.left + box.width ||
          clientY < box.top ||
          clientY > box.top + box.height
        ) {
          continue;
        }
        const parent = findBlock(tree, slot.parentId);
        if (!parent) continue;
        const allowed = slotAllowedBlocks(registry, parent.name, slot.slotKey);
        if (allowed && !allowed.includes(draggingName)) continue;
        const area = box.width * box.height;
        if (area < bestArea) {
          bestArea = area;
          best = { parentId: slot.parentId, slotKey: slot.slotKey, box };
        }
      }
      return best;
    };

    const onMove = (e: PointerEvent): void => {
      const slot = slotTargetAt(e.clientX, e.clientY);
      setDropSlot(slot);
      // A nested slot target supersedes the top-level line indicator.
      setDropY(
        slot ? null : (placementAt(e.clientX, e.clientY)?.indicatorY ?? null),
      );
    };
    const onUp = (e: PointerEvent): void => {
      const slot = slotTargetAt(e.clientX, e.clientY);
      if (slot) {
        // Nested drops append (a sentinel index that insertNode/moveBlock clamp
        // to the slot length).
        const target = {
          parentId: slot.parentId,
          slotKey: slot.slotKey,
          index: Number.MAX_SAFE_INTEGER,
        };
        const allowed = allowedForSlot(slot);
        if (dragSpec) {
          store
            .getState()
            .insertBlockInto(
              createNodeFromEntry(registry, dragSpec),
              target,
              allowed,
            );
        } else if (movingId) {
          store.getState().moveBlock(movingId, target, allowed);
        }
      } else {
        const placement = placementAt(e.clientX, e.clientY);
        if (placement) {
          if (dragSpec) {
            store
              .getState()
              .insertBlock(
                createNodeFromEntry(registry, dragSpec),
                placement.index,
              );
          } else if (movingId) {
            // placement.index counts the pre-removal top level; moveBlock
            // removes the source first, so shift down by one when the source
            // currently sits before the drop point (a downward reorder).
            const top = store.getState().tree;
            const from = top.findIndex((n) => n.id === movingId);
            const index =
              from !== -1 && from < placement.index
                ? placement.index - 1
                : placement.index;
            store.getState().moveBlock(movingId, { parentId: null, index });
          }
        }
      }
      endDrag();
    };
    // Without this, a pointercancel (touch interruption, context menu, drag
    // into a native element) or Escape would skip onUp, stranding the drag set
    // and the iframe permanently non-interactive (pointerEvents: none).
    const onCancel = (): void => endDrag();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      setDropY(null);
      setDropSlot(null);
    };
  }, [dragSpec, movingId, store, registry]);

  const addFirstBlock = useCallback((): void => {
    const [group] = groupInsertables(registry, { capabilities });
    const entry = group?.entries[0];
    if (entry) {
      store.getState().insertBlock(createNodeFromEntry(registry, entry), 0);
    }
  }, [registry, capabilities, store]);

  // Host-side wheel: pan/zoom when the cursor is over the margin around the
  // frame. Over the iframe the gesture is forwarded via the bridge (onWheel
  // above). Native + non-passive so we can preventDefault the page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      handleWheel(
        e.deltaX,
        e.deltaY,
        e.ctrlKey || e.metaKey,
        e.clientX - box.left,
        e.clientY - box.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

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
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: frameWidth,
          height: contentHeight ?? CANVAS_HEIGHT,
          transform: `translate(${String(panX)}px, ${String(panY)}px) scale(${String(zoom)})`,
          transformOrigin: "top left",
        }}
      >
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
        {/* Inside the stage so it sits on the frame (and pans/zooms with it),
            rather than floating over the container now that the frame is
            centered/pannable. */}
        {!readOnly && isEmpty && (
          <button
            type="button"
            data-testid="plumix-empty-add"
            onClick={addFirstBlock}
            className="border-muted-foreground/40 text-muted-foreground hover:bg-accent absolute inset-x-8 top-8 rounded-md border border-dashed p-6 text-sm"
          >
            <Trans id="editor.canvas.addBlock" message="Add a block" />
          </button>
        )}
      </div>
      {/* Clip layer pinned over the visible canvas column. Its overflow:hidden
          keeps the absolutely-positioned overlays + toolbar from spilling onto
          the side rails when the iframe renders wider than the column. */}
      {!readOnly && container && (
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
