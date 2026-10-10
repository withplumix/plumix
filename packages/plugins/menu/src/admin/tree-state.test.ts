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
    linkedLabel: null,
  };
}

describe("getProjection", () => {
  test("returns the over item's slot at the same depth when there is no horizontal drag", () => {
    // dnd-kit's Sortable Tree anchors depth on the previous item in the
    // post-drop array `[B, A]`, so A becomes B's sibling.
    const items = [row("a", null, 0), row("b", null, 1)];

    const projection = getProjection(items, "a", "b", 0, 24, 5);

    expect(projection).toEqual({
      parentKey: null,
      depth: 0,
      sortOrder: 1,
    });
  });

  test("drag-right past one indentation step nests the active item under the previous one", () => {
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
    // The reducer also guards cycles; failing here keeps the live drop
    // indicator honest.
    const items = [row("a", null, 0), row("achild", "a", 0)];

    const projection = getProjection(items, "a", "achild", 99, 24, 5);

    expect(projection).toBeNull();
  });

  test("caps depth so the active item's subtree stays within maxDepth", () => {
    // Nesting A under B would push A.child past maxDepth=1, so the
    // projection clamps A to root.
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
