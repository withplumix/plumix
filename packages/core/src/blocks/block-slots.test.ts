import { describe, expect, test } from "vitest";

import type { BlockNode } from "./index.js";
import { blockSlotKeys, defineBlock } from "./index.js";

const tabs = defineBlock({
  name: "acme/tabs",
  render: () => null,
  inputs: [
    { name: "labels", type: "json" },
    { name: "panels", type: "slot" },
    { name: "footer", type: "slot", rawSlot: true },
  ],
});

describe("blockSlotKeys", () => {
  test("lists exactly the inputs the spec declares as slots, in order", () => {
    const node: BlockNode = {
      id: "t1",
      name: "acme/tabs",
      attrs: { labels: [], panels: [{ id: "1", name: "Alice" }] },
    };

    expect(blockSlotKeys(node, tabs)).toEqual(["panels", "footer"]);
  });

  test("gives an unregistered block no slots, whatever its attrs hold", () => {
    const node: BlockNode = {
      id: "u1",
      name: "acme/missing",
      attrs: { content: [{ id: "c1", name: "core/group" }] },
    };

    expect(blockSlotKeys(node, undefined)).toEqual([]);
  });
});
