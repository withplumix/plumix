import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";
import type { BlockRect } from "@plumix/blocks/renderer";

import type { FrameOffset } from "./overlay.js";
import { createBlockFromSpec, groupBlocksByCategory } from "./block-catalog.js";
import { connectCanvas } from "./connect-canvas.js";
import { dropPlacement } from "./drop-index.js";
import { overlayBox } from "./overlay.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";
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
const HOVER_OUTLINE = "rgba(37,99,235,0.4)";
const CANVAS_HEIGHT = 800;

interface Geometry {
  readonly rects: ReadonlyMap<string, BlockRect>;
  readonly frame: FrameOffset | null;
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
  const hoverId = useEditorStore((s) => s.hoverId);
  const dragSpec = useEditorStore((s) => s.dragSpec);
  const isEmpty = useEditorStore((s) => s.tree.length === 0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [geometry, setGeometry] = useState<Geometry>({
    rects: new Map(),
    frame: null,
  });
  // Mirror geometry for the drag handler so it reads fresh rects without
  // re-subscribing the window listeners on every geometry report.
  const geometryRef = useRef<Geometry>(geometry);
  const [dropY, setDropY] = useState<number | null>(null);

  useEffect(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    const connection = connectCanvas({
      store,
      frameWindow,
      origin,
      onGeometry: (reported) => {
        const rect = iframeRef.current?.getBoundingClientRect();
        const next: Geometry = {
          rects: new Map(reported.map((r) => [r.id, r])),
          frame: rect ? { left: rect.left, top: rect.top } : null,
        };
        geometryRef.current = next;
        setGeometry(next);
      },
    });
    return () => connection.dispose();
  }, [store, origin]);

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

  const overlay = (
    id: string | null,
    color: string,
    testId: string,
  ): ReactElement | null => {
    if (!id || !geometry.frame) return null;
    const rect = geometry.rects.get(id);
    if (!rect) return null;
    const box = overlayBox(rect, geometry.frame, zoom);
    return (
      <div
        data-testid={testId}
        style={{
          position: "fixed",
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
      {overlay(hoverId, HOVER_OUTLINE, "plumix-overlay-hover")}
      {overlay(activeId, SELECTED_OUTLINE, "plumix-overlay-selected")}
      {dropY !== null && geometry.frame && (
        <div
          data-testid="plumix-drop-indicator"
          style={{
            position: "fixed",
            left: geometry.frame.left,
            top: dropY,
            width: DEVICE_WIDTH[device] * zoom,
            height: 2,
            background: SELECTED_OUTLINE,
            pointerEvents: "none",
            zIndex: 20,
          }}
        />
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
