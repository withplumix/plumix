import { describe, expect, test } from "vitest";

import type { BlockNode, InsertableBlockEntry } from "@plumix/blocks";

import { computeVariationMergeAttrs } from "./insert-variation.js";

describe("computeVariationMergeAttrs", () => {
  test("returns the entry's plain attrs when no innerBlocks are declared", () => {
    const entry: InsertableBlockEntry = {
      name: "core/group",
      slug: "core/group/with-layout",
      title: "Group with layout",
      attrs: { layout: "stack" },
    };
    expect(computeVariationMergeAttrs(entry)).toEqual({ layout: "stack" });
  });

  test("emits an empty object when neither attrs nor innerBlocks are set", () => {
    const entry: InsertableBlockEntry = {
      name: "core/details",
      slug: "core/details",
      title: "Details",
    };
    expect(computeVariationMergeAttrs(entry)).toEqual({});
  });

  test("converts innerBlocks to ComponentData[] under the conventional `content` slot key", () => {
    const heading: BlockNode = {
      id: "src-h",
      name: "core/heading",
      attrs: { level: 2, text: "Hi" },
    };
    const entry: InsertableBlockEntry = {
      name: "core/group",
      slug: "core/group/with-heading",
      title: "Group with heading",
      attrs: { layout: "stack" },
      innerBlocks: [heading],
    };
    const merge = computeVariationMergeAttrs(entry);
    expect(merge.layout).toBe("stack");
    const slot = merge.content as readonly { type: string }[];
    expect(slot).toHaveLength(1);
    expect(slot[0]?.type).toBe("core/heading");
  });

  test("does not mutate source innerBlocks and re-IDs every call", () => {
    const heading: BlockNode = {
      id: "src-h",
      name: "core/heading",
      attrs: { level: 2 },
    };
    const entry: InsertableBlockEntry = {
      name: "core/group",
      slug: "core/group/with-heading",
      title: "Group with heading",
      innerBlocks: [heading],
    };
    const first = computeVariationMergeAttrs(entry).content as readonly {
      props: { id: string };
    }[];
    const second = computeVariationMergeAttrs(entry).content as readonly {
      props: { id: string };
    }[];
    expect(first[0]?.props.id).not.toBe(second[0]?.props.id);
    expect(heading.id).toBe("src-h");
    expect(heading.attrs).toEqual({ level: 2 });
  });
});
