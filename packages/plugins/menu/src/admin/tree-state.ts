// Pure projection helpers for the dnd-kit Sortable Tree integration.
// `getProjection` answers "if the user releases the drag now, where
// would the item land?" — the editor consumes the result both to
// preview the drop indicator and, on `onDragEnd`, to dispatch
// `moveItem(parentKey, sortOrder)`.

import type { EditorAction, EditorItem, ItemKey } from "./editor-state.js";
import { collectSubtreeKeys, computeDepths } from "./editor-state.js";

interface Projection {
  readonly parentKey: ItemKey | null;
  readonly depth: number;
  readonly sortOrder: number;
}

export function dragEndToAction(
  items: readonly EditorItem[],
  activeKey: ItemKey,
  overKey: ItemKey,
  dragOffsetX: number,
  indentationWidth: number,
  maxDepth: number,
): EditorAction | null {
  const projection = getProjection(
    items,
    activeKey,
    overKey,
    dragOffsetX,
    indentationWidth,
    maxDepth,
  );
  if (!projection) return null;
  return {
    type: "moveItem",
    key: activeKey,
    newParentKey: projection.parentKey,
    newSortOrder: projection.sortOrder,
  };
}

export function getProjection(
  items: readonly EditorItem[],
  activeKey: ItemKey,
  overKey: ItemKey,
  dragOffsetX: number,
  indentationWidth: number,
  maxDepth: number,
): Projection | null {
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  const overIndex = items.findIndex((item) => item.key === overKey);
  if (activeIndex < 0 || overIndex < 0) return null;

  const reordered = [...items];
  const [active] = reordered.splice(activeIndex, 1);
  if (!active) return null;
  reordered.splice(overIndex, 0, active);

  const depths = computeDepths(items);
  const activeDepth = depths.get(activeKey) ?? 0;

  const previousItem = reordered[overIndex - 1];
  const nextItem = reordered[overIndex + 1];
  const previousDepth =
    previousItem === undefined ? -1 : (depths.get(previousItem.key) ?? 0);
  const nextDepth =
    nextItem === undefined ? 0 : (depths.get(nextItem.key) ?? 0);

  const projectedDepth =
    activeDepth + Math.round(dragOffsetX / indentationWidth);
  const maxAllowedDepth = previousItem === undefined ? 0 : previousDepth + 1;
  const minAllowedDepth = nextDepth;
  // The active item carries its subtree along on the move, so its depth
  // ceiling is `maxDepth - subtreeExtra` — anything higher would push a
  // descendant past `maxDepth`. Clamping here makes the drop indicator
  // visibly stop short instead of letting the user release into a
  // position the reducer would reject.
  const subtreeExtra = subtreeDepthExtra(items, activeIndex, depths);
  const depthCap = Math.max(0, maxDepth - subtreeExtra);
  const depth = Math.min(
    clamp(projectedDepth, minAllowedDepth, maxAllowedDepth),
    depthCap,
  );

  const parentKey = resolveParentAtDepth(items, previousItem, depth, depths);
  // Reject projections that would form a cycle (parent is active itself
  // or any descendant). The reducer also guards, but null here keeps
  // the live drop indicator honest.
  if (parentKey !== null) {
    const subtree = collectSubtreeKeys(items, activeKey);
    if (subtree.has(parentKey)) return null;
  }
  const sortOrder = indexAmongSiblingsAfterMove(
    reordered,
    activeKey,
    parentKey,
  );
  return { parentKey, depth, sortOrder };
}

function subtreeDepthExtra(
  items: readonly EditorItem[],
  activeIndex: number,
  depths: ReadonlyMap<ItemKey, number>,
): number {
  const active = items[activeIndex];
  if (!active) return 0;
  const activeDepth = depths.get(active.key) ?? 0;
  let max = 0;
  for (let i = activeIndex + 1; i < items.length; i += 1) {
    const item = items[i];
    if (!item) continue;
    const d = depths.get(item.key) ?? 0;
    if (d <= activeDepth) break;
    if (d - activeDepth > max) max = d - activeDepth;
  }
  return max;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveParentAtDepth(
  items: readonly EditorItem[],
  previousItem: EditorItem | undefined,
  targetDepth: number,
  depths: ReadonlyMap<ItemKey, number>,
): ItemKey | null {
  if (targetDepth === 0 || previousItem === undefined) return null;
  let current: EditorItem | undefined = previousItem;
  while (
    current !== undefined &&
    (depths.get(current.key) ?? 0) > targetDepth - 1
  ) {
    current = items.find((item) => item.key === current?.parentKey);
  }
  return current?.key ?? null;
}

function indexAmongSiblingsAfterMove(
  reordered: readonly EditorItem[],
  activeKey: ItemKey,
  parentKey: ItemKey | null,
): number {
  let count = 0;
  for (const item of reordered) {
    if (item.key === activeKey) return count;
    if (item.parentKey === parentKey) count += 1;
  }
  return count;
}
