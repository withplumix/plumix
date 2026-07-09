import type { BlockNode, BlockRegistry } from "@plumix/blocks";
import type { SlotRect } from "@plumix/blocks/renderer";

import type { SlotDrop } from "./canvas-geometry.js";
import type { FrameOffset } from "./overlay.js";
import { slotAllowedBlocks } from "./block-catalog.js";
import { findBlock } from "./block-tree-ops.js";
import { overlayBox } from "./overlay.js";

/**
 * The innermost slot under the pointer that accepts `draggingName`, mapped from
 * iframe-local slot geometry into screen space. Innermost (smallest box) wins so
 * a slot nested inside a slot is reachable; a slot's `allowedBlocks` gates
 * whether it lights up at all. Pure — the caller supplies the live frame offset
 * (from the iframe's `getBoundingClientRect`) and zoom.
 */
export function resolveSlotTarget({
  slots,
  tree,
  registry,
  draggingName,
  frame,
  zoom,
  clientX,
  clientY,
}: {
  readonly slots: readonly SlotRect[];
  readonly tree: readonly BlockNode[];
  readonly registry: BlockRegistry;
  readonly draggingName: string;
  readonly frame: FrameOffset;
  readonly zoom: number;
  readonly clientX: number;
  readonly clientY: number;
}): SlotDrop | null {
  let best: SlotDrop | null = null;
  let bestArea = Infinity;
  for (const slot of slots) {
    const box = overlayBox(slot, frame, zoom);
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
}

/**
 * The top-level drop index adjusted for a move. `dropPlacement` counts the
 * pre-removal top level, but `moveBlock` removes the source first — so a
 * downward reorder (source currently sits before the drop point) shifts the
 * target down by one. Pure.
 */
export function reorderIndex(
  tree: readonly BlockNode[],
  movingId: string,
  placementIndex: number,
): number {
  const from = tree.findIndex((n) => n.id === movingId);
  return from !== -1 && from < placementIndex
    ? placementIndex - 1
    : placementIndex;
}
