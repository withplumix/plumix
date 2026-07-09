import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { useLingui } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";

import type { Geometry, SlotDrop } from "./canvas-geometry.js";
import type { FrameOffset } from "./overlay.js";
import { createNodeFromEntry, slotAllowedBlocks } from "./block-catalog.js";
import { findBlock } from "./block-tree-ops.js";
import { reorderIndex, resolveSlotTarget } from "./canvas-drop-target.js";
import { dropPlacement } from "./drop-index.js";
import { overlayBox } from "./overlay.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

/** The in-canvas "Add a block" popover target: a slot carries both ids; the
 *  root document carries neither (every block offered). */
interface PendingAdd {
  readonly parentId?: string;
  readonly slotKey?: string;
}

export interface CanvasDrag {
  /** Top-level insert indicator Y (host space); null when a slot target wins. */
  readonly dropY: number | null;
  /** Resolved nested-slot drop target, or null. */
  readonly dropSlot: SlotDrop | null;
  /** Open inserter-popover target; null when closed. */
  readonly pendingAdd: PendingAdd | null;
  readonly setPendingAdd: (next: PendingAdd | null) => void;
  /** Open the slot-scoped inserter for a target (root when both ids omitted). */
  readonly requestAdd: (parentId?: string, slotKey?: string) => void;
  /** Transient "can't place here" notice for a refused `requiresParent` drop. */
  readonly rejection: string | null;
}

/**
 * Canvas drag-to-insert/move: resolves a catalog drag (`dragSpec`) or a block
 * move (`movingId`) into a top-level placement or a nested-slot target from the
 * reported block + slot geometry, and commits the insert/move on drop. Also owns
 * the in-canvas inserter popover state and the transient rejection notice.
 */
export function useCanvasDrag({
  iframeRef,
  geometryRef,
  registry,
}: {
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly geometryRef: RefObject<Geometry>;
  readonly registry: BlockRegistry;
}): CanvasDrag {
  const { i18n } = useLingui();
  const store = useEditorStoreApi();
  const dragSpec = useEditorStore((s) => s.dragSpec);
  const movingId = useEditorStore((s) => s.movingId);

  const [dropY, setDropY] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<SlotDrop | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  // An in-canvas "Add a block" click opens the slot-scoped inserter popover
  // rather than inserting a default — the author picks the block. Root has no
  // parentId/slotKey; a slot carries both.
  const requestAdd = useCallback(
    (parentId?: string, slotKey?: string): void => {
      setPendingAdd({ parentId, slotKey });
    },
    [],
  );

  // Radix dismisses the inserter on an outside pointerdown, but those events
  // fire on the host document — a click *inside* the cross-frame canvas never
  // reaches it, so the popover would stay open. Opening the inserter moves focus
  // into its content (host document); a later click into the iframe blurs the
  // host window, which we treat as an outside interaction and close on.
  useEffect(() => {
    if (!pendingAdd) return;
    const close = (): void => setPendingAdd(null);
    window.addEventListener("blur", close);
    return () => window.removeEventListener("blur", close);
  }, [pendingAdd]);

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

    // Reads the live iframe rect + store, then delegates the hit-test.
    const slotTargetAt = (
      clientX: number,
      clientY: number,
    ): SlotDrop | null => {
      const rect = iframe.getBoundingClientRect();
      const { tree, zoom } = store.getState();
      return resolveSlotTarget({
        slots: geometryRef.current.slots,
        tree,
        registry,
        draggingName,
        frame: { left: rect.left, top: rect.top },
        zoom,
        clientX,
        clientY,
      });
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
      // A `requiresParent` block is refused unless the parent it would land
      // under (a slot's parent, or none at the top level) is in its list.
      const req = registry.get(draggingName)?.requiresParent;
      const refuse = (): void => {
        setRejection(
          i18n._({
            id: "editor.canvas.cantPlaceHere",
            message: "This block can't be placed here.",
          }),
        );
        endDrag();
      };

      const slot = slotTargetAt(e.clientX, e.clientY);
      if (slot) {
        const parent = findBlock(store.getState().tree, slot.parentId);
        if (req && (!parent || !req.includes(parent.name))) {
          refuse();
          return;
        }
        // Nested drops append (a sentinel index that insertNode/moveBlock clamp
        // to the slot length).
        const target = {
          parentId: slot.parentId,
          slotKey: slot.slotKey,
          index: Number.MAX_SAFE_INTEGER,
        };
        const allowed = parent
          ? slotAllowedBlocks(registry, parent.name, slot.slotKey)
          : undefined;
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
          // A `requiresParent` block can't live at the top level.
          if (req) {
            refuse();
            return;
          }
          if (dragSpec) {
            store
              .getState()
              .insertBlock(
                createNodeFromEntry(registry, dragSpec),
                placement.index,
              );
          } else if (movingId) {
            const index = reorderIndex(
              store.getState().tree,
              movingId,
              placement.index,
            );
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
  }, [dragSpec, movingId, store, registry, i18n, iframeRef, geometryRef]);

  // Auto-dismiss the transient rejection notice.
  useEffect(() => {
    if (!rejection) return;
    const t = setTimeout(() => setRejection(null), 2500);
    return () => clearTimeout(t);
  }, [rejection]);

  return {
    dropY,
    dropSlot,
    pendingAdd,
    setPendingAdd,
    requestAdd,
    rejection,
  };
}
