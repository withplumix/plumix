import { describe, expect, test } from "vitest";

import type { BlockNode, BlockSpec } from "@plumix/blocks";
import type { SlotRect } from "@plumix/blocks/renderer";
import { createBlockRegistry } from "@plumix/blocks";

import { reorderIndex, resolveSlotTarget } from "./canvas-drop-target.js";

const spec = (over: Partial<BlockSpec> & { name: string }): BlockSpec => ({
  render: () => null,
  ...over,
});
const node = (id: string, name: string): BlockNode => ({ id, name });
const slot = (
  parentId: string,
  slotKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
): SlotRect => ({ parentId, slotKey, x, y, width, height });

// core/group's slot has no allowedBlocks (permits any); core/buttons only
// admits core/button.
const registry = createBlockRegistry([
  spec({
    name: "core/group",
    inputs: [{ name: "content", type: "slot", label: "Content" }],
  }),
  spec({
    name: "core/buttons",
    inputs: [
      {
        name: "items",
        type: "slot",
        label: "Buttons",
        allowedBlocks: ["core/button"],
      },
    ],
  }),
]);

const IDENTITY = { frame: { left: 0, top: 0 }, zoom: 1 } as const;

describe("resolveSlotTarget", () => {
  test("returns null when the point is outside every slot", () => {
    expect(
      resolveSlotTarget({
        slots: [slot("g1", "content", 0, 0, 100, 100)],
        tree: [node("g1", "core/group")],
        registry,
        draggingName: "core/rich-text",
        ...IDENTITY,
        clientX: 200,
        clientY: 200,
      }),
    ).toBeNull();
  });

  test("resolves the slot under the pointer", () => {
    const r = resolveSlotTarget({
      slots: [slot("g1", "content", 0, 0, 100, 100)],
      tree: [node("g1", "core/group")],
      registry,
      draggingName: "core/rich-text",
      ...IDENTITY,
      clientX: 50,
      clientY: 50,
    });
    expect(r).toMatchObject({ parentId: "g1", slotKey: "content" });
  });

  test("innermost (smallest-area) slot wins when nested", () => {
    const r = resolveSlotTarget({
      slots: [
        slot("g1", "content", 0, 0, 100, 100),
        slot("g2", "content", 20, 20, 40, 40),
      ],
      tree: [node("g1", "core/group"), node("g2", "core/group")],
      registry,
      draggingName: "core/rich-text",
      ...IDENTITY,
      clientX: 30,
      clientY: 30,
    });
    expect(r?.parentId).toBe("g2");
  });

  test("skips a slot whose allowedBlocks excludes the dragged block", () => {
    expect(
      resolveSlotTarget({
        slots: [slot("b1", "items", 0, 0, 100, 100)],
        tree: [node("b1", "core/buttons")],
        registry,
        draggingName: "core/rich-text",
        ...IDENTITY,
        clientX: 50,
        clientY: 50,
      }),
    ).toBeNull();
  });

  test("admits a slot whose allowedBlocks includes the dragged block", () => {
    const r = resolveSlotTarget({
      slots: [slot("b1", "items", 0, 0, 100, 100)],
      tree: [node("b1", "core/buttons")],
      registry,
      draggingName: "core/button",
      ...IDENTITY,
      clientX: 50,
      clientY: 50,
    });
    expect(r?.parentId).toBe("b1");
  });

  test("skips a slot whose parent isn't in the tree", () => {
    expect(
      resolveSlotTarget({
        slots: [slot("ghost", "content", 0, 0, 100, 100)],
        tree: [],
        registry,
        draggingName: "core/rich-text",
        ...IDENTITY,
        clientX: 50,
        clientY: 50,
      }),
    ).toBeNull();
  });

  test("maps slot geometry through the frame offset and zoom", () => {
    // slot at iframe (10,10,20,20); frame (100,50), zoom 2 → screen box
    // left 120, top 70, width 40, height 40.
    const args = {
      slots: [slot("g1", "content", 10, 10, 20, 20)],
      tree: [node("g1", "core/group")],
      registry,
      draggingName: "core/rich-text",
      frame: { left: 100, top: 50 },
      zoom: 2,
    };
    expect(
      resolveSlotTarget({ ...args, clientX: 130, clientY: 80 })?.parentId,
    ).toBe("g1");
    expect(
      resolveSlotTarget({ ...args, clientX: 110, clientY: 60 }),
    ).toBeNull();
  });
});

describe("reorderIndex", () => {
  const tree = [node("a", "core/x"), node("b", "core/x"), node("c", "core/x")];

  test("shifts down by one for a downward move (source before target)", () => {
    expect(reorderIndex(tree, "a", 2)).toBe(1);
  });

  test("no shift for an upward move (source after target)", () => {
    expect(reorderIndex(tree, "c", 1)).toBe(1);
  });

  test("no shift when the source sits at the placement index", () => {
    expect(reorderIndex(tree, "b", 1)).toBe(1);
  });

  test("no shift when the source isn't in the tree", () => {
    expect(reorderIndex(tree, "zzz", 2)).toBe(2);
  });
});
