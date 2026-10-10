import type { BlockNode, BlockRegistry } from "@plumix/core/blocks";
import type { SlotRect } from "@plumix/core/blocks/renderer";

import type { MoveTarget } from "./block-tree-ops.js";
import type { SlotDrop } from "./canvas-geometry.js";
import type { FrameOffset } from "./overlay.js";
import { slotAllowedBlocks } from "./block-catalog.js";
import { findBlock } from "./block-tree-ops.js";
import { overlayBox } from "./overlay.js";

interface SlotHitTest {
  readonly slots: readonly SlotRect[];
  readonly tree: readonly BlockNode[];
  readonly registry: BlockRegistry;
  readonly draggingName: string;
  readonly frame: FrameOffset;
  readonly zoom: number;
  readonly clientX: number;
  readonly clientY: number;
}

interface SlotHit extends SlotDrop {
  readonly accepts: boolean;
}

function slotsUnderPointer({
  slots,
  tree,
  registry,
  draggingName,
  frame,
  zoom,
  clientX,
  clientY,
}: SlotHitTest): SlotHit[] {
  const hits: SlotHit[] = [];
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
    const parent = findBlock(tree, slot.parentId, registry);
    if (!parent) continue;
    const allowed = slotAllowedBlocks(registry, parent.name, slot.slotKey);
    hits.push({
      parentId: slot.parentId,
      slotKey: slot.slotKey,
      box,
      accepts: !allowed || allowed.includes(draggingName),
    });
  }
  return hits;
}

function innermost(hits: readonly SlotHit[]): SlotDrop | null {
  let best: SlotDrop | null = null;
  let bestArea = Infinity;
  for (const { parentId, slotKey, box } of hits) {
    const area = box.width * box.height;
    if (area < bestArea) {
      bestArea = area;
      best = { parentId, slotKey, box };
    }
  }
  return best;
}

/**
 * Innermost (smallest box) wins, so a slot nested inside a slot is reachable.
 */
export function resolveSlotTarget(args: SlotHitTest): SlotDrop | null {
  return innermost(slotsUnderPointer(args).filter((hit) => hit.accepts));
}

/**
 * The refusing slot the drop skipped: only one inside the accepting target, or
 * any when none accepts. A refusing container around the target doesn't count.
 */
export function resolveRefusedSlot(args: SlotHitTest): SlotDrop | null {
  const hits = slotsUnderPointer(args);
  const target = innermost(hits.filter((hit) => hit.accepts));
  const refused = innermost(hits.filter((hit) => !hit.accepts));
  if (!refused) return null;
  if (!target) return refused;
  const targetArea = target.box.width * target.box.height;
  return refused.box.width * refused.box.height < targetArea ? refused : null;
}

/**
 * `dropPlacement` counts the pre-removal top level but `moveBlock` removes the
 * source first, so a downward reorder shifts the target by one.
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
 * A `requiresParent` block is refused at the top level, and into a slot unless
 * the slot's `parentName` is listed.
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
  /**
   * The resolved nested-slot target, or null when none is under the pointer.
   */
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
