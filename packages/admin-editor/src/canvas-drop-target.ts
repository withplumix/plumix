import type { BlockNode, BlockRegistry } from "@plumix/blocks";
import type { SlotRect } from "@plumix/blocks/renderer";

import type { MoveTarget } from "./block-tree-ops.js";
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

/** What a completed canvas drag resolves to before it touches the store. The
 *  index carried by `insert`/`reorder` is the top-level placement index — the
 *  caller applies `reorderIndex` for a move. */
export type DropOutcome =
  | { readonly kind: "insertInto"; readonly target: MoveTarget }
  | { readonly kind: "move"; readonly target: MoveTarget }
  | { readonly kind: "insert"; readonly index: number }
  | { readonly kind: "reorder"; readonly index: number }
  | { readonly kind: "refuse" }
  | { readonly kind: "none" };

/**
 * The drop dispatch decision: from the drag source, the resolved slot target
 * (or none), and the top-level placement (or none), decide which store action
 * fires. Pure, so the `requiresParent` gate — refused at the top level, and into
 * a slot only when the slot's parent (`parentName`) is in the list — is testable
 * without a live canvas.
 */
export function resolveDrop({
  source,
  slot,
  placement,
  requiresParent,
  parentName,
}: {
  /** Where the drag came from: a catalog insert or an existing-block move. */
  readonly source: "insert" | "move";
  /** The resolved nested-slot target, or null when none is under the pointer. */
  readonly slot: {
    readonly parentId: string;
    readonly slotKey: string;
  } | null;
  /** The top-level placement, or null when the pointer is off the canvas. */
  readonly placement: { readonly index: number } | null;
  /** The dragged block's `requiresParent` allow-list, when it has one. */
  readonly requiresParent?: readonly string[];
  /** The slot parent's block name, when `slot` is non-null — the
   *  `requiresParent` membership check reads it. */
  readonly parentName?: string;
}): DropOutcome {
  if (slot) {
    if (
      requiresParent &&
      (!parentName || !requiresParent.includes(parentName))
    ) {
      return { kind: "refuse" };
    }
    // Nested drops append; insertNode/moveBlock clamp the sentinel to length.
    const target: MoveTarget = {
      parentId: slot.parentId,
      slotKey: slot.slotKey,
      index: Number.MAX_SAFE_INTEGER,
    };
    return source === "insert"
      ? { kind: "insertInto", target }
      : { kind: "move", target };
  }
  if (!placement) return { kind: "none" };
  // A `requiresParent` block can't live at the top level.
  if (requiresParent) return { kind: "refuse" };
  return source === "insert"
    ? { kind: "insert", index: placement.index }
    : { kind: "reorder", index: placement.index };
}
