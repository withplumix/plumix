import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import type { BlockRect } from "@plumix/blocks/renderer";

import type { FrameOffset, OverlayBox } from "./overlay.js";
import { createBlockFromSpec, groupBlocksByCategory } from "./block-catalog.js";
import { connectCanvas } from "./connect-canvas.js";
import { dropPlacement } from "./drop-index.js";
import { overlayBox } from "./overlay.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";
import { SelectionToolbar } from "./selection-toolbar.js";
import { DEVICE_WIDTH } from "./store.js";

interface CanvasFrameProps {
  /** URL the iframe loads — the entry's real route with `?plumix.edit`. */
  readonly previewUrl: string;
  /** Origin of that route, for bridge message pinning. */
  readonly origin: string;
  /** Catalog for the empty-state affordance's default block. */
  readonly registry: BlockRegistry;
  /** Viewer capabilities, gating which block the empty state inserts. */
  readonly capabilities: ReadonlySet<string>;
}

const SELECTED_OUTLINE = "#2563eb";
const MEMBER_OUTLINE = "rgba(37,99,235,0.5)";
const HOVER_OUTLINE = "rgba(37,99,235,0.4)";
const CANVAS_HEIGHT = 800;

interface Geometry {
  readonly rects: ReadonlyMap<string, BlockRect>;
  /** The iframe's on-screen offset, for mapping block rects to overlay boxes. */
  readonly frame: FrameOffset | null;
  /** The canvas viewport's on-screen box — overlays clip to this so they never
   *  spill over the side rails (the iframe renders wider than the column). */
  readonly container: OverlayBox | null;
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
}: CanvasFrameProps): ReactElement {
  const store = useEditorStoreApi();
  const device = useEditorStore((s) => s.device);
  const zoom = useEditorStore((s) => s.zoom);
  const activeId = useEditorStore((s) => s.activeId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const hoverId = useEditorStore((s) => s.hoverId);
  const dragSpec = useEditorStore((s) => s.dragSpec);
  const isEmpty = useEditorStore((s) => s.tree.length === 0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry>({
    rects: new Map(),
    frame: null,
    container: null,
  });
  // Mirror geometry for the drag handler so it reads fresh rects without
  // re-subscribing the window listeners on every geometry report.
  const geometryRef = useRef<Geometry>(geometry);
  const [dropY, setDropY] = useState<number | null>(null);

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
      onGeometry: (reported) => {
        const next: Geometry = {
          rects: new Map(reported.map((r) => [r.id, r])),
          ...measureHost(),
        };
        geometryRef.current = next;
        setGeometry(next);
      },
    });
    return () => connection.dispose();
  }, [store, origin, measureHost]);

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

  // Catalog drag → top-level insert. While dragging, the iframe ignores pointer
  // events so the host keeps receiving them over the canvas; the placement is
  // computed from the reported block geometry mapped into screen space.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!dragSpec || !iframe) return;
    iframe.style.pointerEvents = "none";

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

    const onMove = (e: PointerEvent): void => {
      setDropY(placementAt(e.clientX, e.clientY)?.indicatorY ?? null);
    };
    const onUp = (e: PointerEvent): void => {
      const placement = placementAt(e.clientX, e.clientY);
      if (placement) {
        store
          .getState()
          .insertBlock(createBlockFromSpec(dragSpec), placement.index);
      }
      store.getState().endBlockDrag();
    };
    // Without this, a pointercancel (touch interruption, context menu, drag
    // into a native element) or Escape would skip onUp, stranding dragSpec set
    // and the iframe permanently non-interactive (pointerEvents: none).
    const onCancel = (): void => store.getState().endBlockDrag();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") store.getState().endBlockDrag();
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
      iframe.style.pointerEvents = "";
      setDropY(null);
    };
  }, [dragSpec, store]);

  const addFirstBlock = useCallback((): void => {
    const [group] = groupBlocksByCategory(registry, { capabilities });
    const spec = group?.blocks[0];
    if (spec) store.getState().insertBlock(createBlockFromSpec(spec), 0);
  }, [registry, capabilities, store]);

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
      style={{ position: "relative", flex: 1, overflow: "auto" }}
    >
      <iframe
        ref={iframeRef}
        src={previewUrl}
        title="plumix-editor-canvas"
        style={{
          width: DEVICE_WIDTH[device],
          height: CANVAS_HEIGHT,
          border: 0,
          transform: `scale(${String(zoom)})`,
          transformOrigin: "top left",
        }}
      />
      {/* Clip layer pinned over the visible canvas column. Its overflow:hidden
          keeps the absolutely-positioned overlays + toolbar from spilling onto
          the side rails when the iframe renders wider than the column. */}
      {container && (
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
          {dropY !== null && geometry.frame && (
            <div
              data-testid="plumix-drop-indicator"
              style={{
                position: "absolute",
                left: geometry.frame.left - container.left,
                top: dropY - container.top,
                width: DEVICE_WIDTH[device] * zoom,
                height: 2,
                background: SELECTED_OUTLINE,
                pointerEvents: "none",
                zIndex: 20,
              }}
            />
          )}
        </div>
      )}
      {/* Stays visible during a drag so an empty canvas still shows a drop
          target (no block geometry exists to draw an indicator against). */}
      {isEmpty && (
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
