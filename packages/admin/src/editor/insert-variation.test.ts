import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import type { InsertableBlockEntry } from "@plumix/blocks";

import { insertVariation } from "./insert-variation.js";
import { puckDataToBlockTree } from "./puck-to-block-tree.js";

function emptyData(): Data {
  return { content: [], root: { props: {} } };
}

describe("insertVariation", () => {
  test("inserts a parent block whose Puck slot carries innerBlocks the walker can read back", () => {
    const entry: InsertableBlockEntry = {
      name: "core/group",
      slug: "core/group/with-heading",
      title: "Group with heading",
      attrs: { layout: "stack" },
      innerBlocks: [
        { id: "src-h", name: "core/heading", attrs: { level: 2, text: "Hi" } },
      ],
    };
    const after = insertVariation(emptyData(), entry, 0);
    const tree = puckDataToBlockTree(after);
    expect(tree).toHaveLength(1);
    const parent = tree[0];
    expect(parent?.name).toBe("core/group");
    expect(parent?.attrs?.layout).toBe("stack");
    const slot = parent?.attrs?.content as readonly { name: string }[];
    expect(slot).toHaveLength(1);
    expect(slot[0]?.name).toBe("core/heading");
  });

  test("does not mutate source innerBlocks and ID-rewrites on every insert", () => {
    const heading = {
      id: "src-h",
      name: "core/heading",
      attrs: { level: 2 },
    } as const;
    const entry: InsertableBlockEntry = {
      name: "core/group",
      slug: "core/group/with-heading",
      title: "Group with heading",
      innerBlocks: [heading],
    };
    const first = insertVariation(emptyData(), entry, 0);
    const second = insertVariation(emptyData(), entry, 0);
    const firstTree = puckDataToBlockTree(first);
    const secondTree = puckDataToBlockTree(second);
    const firstSlot = firstTree[0]?.attrs?.content as readonly { id: string }[];
    const secondSlot = secondTree[0]?.attrs?.content as readonly {
      id: string;
    }[];
    expect(firstSlot[0]?.id).not.toBe(secondSlot[0]?.id);
    expect(firstSlot[0]?.id).not.toBe("src-h");
    expect(heading.id).toBe("src-h");
    expect(heading.attrs).toEqual({ level: 2 });
  });
});
