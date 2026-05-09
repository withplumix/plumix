import { describe, expect, test } from "vitest";

import type { EditorItem } from "./editor-state.js";
import { dragEndToAction, getProjection } from "./tree-state.js";

function row(
  key: string,
  parentKey: string | null,
  sortOrder: number,
): EditorItem {
  // dnd-kit's projection only consults key, parentKey, and sortOrder
  // — the rest is irrelevant for these tests, hence the stub values.
  return {
    key,
    id: null,
    parentKey,
    sortOrder,
    title: key,
    meta: { kind: "custom", url: `/${key}` },
    state: "ok",
    resolvedLabel: key,
  };
}

describe("getProjection", () => {
  test("returns the over item's slot at the same depth when there is no horizontal drag", () => {
    // Drag A onto B with zero offset. The dnd-kit Sortable Tree pattern
    // simulates the post-drop array `[B, A]`, takes A's previous item B
    // as the depth anchor, and produces (parentKey=null, depth=0,
    // sortOrder=1) — A becomes B's sibling after B.
    const items = [row("a", null, 0), row("b", null, 1)];

    const projection = getProjection(items, "a", "b", 0, 24, 5);

    expect(projection).toEqual({
      parentKey: null,
      depth: 0,
      sortOrder: 1,
    });
  });

  test("drag-right past one indentation step nests the active item under the previous one", () => {
    // After dropping A behind B, dragging right by one indent unit asks
    // dnd-kit "nest under the previous item." `previous` here is B in
    // the post-reorder list, so A becomes B's first child.
    const items = [row("a", null, 0), row("b", null, 1)];

    const projection = getProjection(items, "a", "b", 24, 24, 5);

    expect(projection).toEqual({
      parentKey: "b",
      depth: 1,
      sortOrder: 0,
    });
  });

  test("drag-left past one indentation step unparents the active item", () => {
    // [A (root), A.child (under A)]. Dragging A.child left without
    // changing its over — projection drops a level: parentKey null,
    // depth 0, slotted after A among root-level items.
    const items = [row("a", null, 0), row("achild", "a", 0)];

    const projection = getProjection(items, "achild", "achild", -24, 24, 5);

    expect(projection).toEqual({
      parentKey: null,
      depth: 0,
      sortOrder: 1,
    });
  });

  test("returns null when the resolved parent is the active item or one of its descendants", () => {
    // Dragging A onto its own child A.child with rightward offset would
    // resolve to parentKey === A.child (or even A itself). Releasing
    // there forms a cycle — the reducer also guards, but failing fast
    // here means the live drop indicator never lies.
    const items = [row("a", null, 0), row("achild", "a", 0)];

    const projection = getProjection(items, "a", "achild", 99, 24, 5);

    expect(projection).toBeNull();
  });

  test("caps depth so the active item's subtree stays within maxDepth", () => {
    // Active A has a child at depth 1. Dragging A right behind B would
    // try to nest A under B (depth 1), pushing A.child to depth 2.
    // With maxDepth=1 the projection clamps depth to 0 so the visible
    // indicator stops at root level — the visible "rejection" feedback.
    const items = [row("a", null, 0), row("achild", "a", 0), row("b", null, 1)];

    const projection = getProjection(items, "a", "b", 99, 24, 1);

    expect(projection).toEqual({ parentKey: null, depth: 0, sortOrder: 1 });
  });
});

describe("dragEndToAction", () => {
  test("returns a moveItem action carrying the projected drop target", () => {
    // The component wires dnd-kit's onDragEnd to this helper so the
    // projection-to-action translation lives outside React. Cycle-9 wiring
    // can then stay a thin call-site that only knows about React state.
    const items = [row("a", null, 0), row("b", null, 1)];

    const action = dragEndToAction(items, "a", "b", 24, 24, 5);

    expect(action).toEqual({
      type: "moveItem",
      key: "a",
      newParentKey: "b",
      newSortOrder: 0,
    });
  });

  test("returns null when the projection cannot be resolved (active key missing)", () => {
    const items = [row("a", null, 0), row("b", null, 1)];

    const action = dragEndToAction(items, "ghost", "b", 0, 24, 5);

    expect(action).toBeNull();
  });
});
