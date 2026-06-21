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
}: CanvasFrameProps): ReactElement {
  const store = useEditorStoreApi();
  const device = useEditorStore((s) => s.device);
  const zoom = useEditorStore((s) => s.zoom);
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
  const [dropY, setDropY] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<SlotDrop | null>(null);

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

  // Canvas drag, shared by two sources: a catalog block being inserted
  // (dragSpec) and an existing block being moved (movingId). While dragging, the
  // iframe ignores pointer events so the host keeps receiving them; the target
  // is computed from the reported block + slot geometry mapped into screen space.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const draggingName =
      dragSpec?.name ??
      (movingId ? findBlock(store.getState().tree, movingId)?.name : undefined);
    if (!draggingName) return;
    iframe.style.pointerEvents = "none";

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
      iframe.style.pointerEvents = "";
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
