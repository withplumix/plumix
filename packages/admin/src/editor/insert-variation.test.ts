import type { Data, PuckAction } from "@puckeditor/core";
import { describe, expect, test, vi } from "vitest";

import type { BlockNode, InsertableBlockEntry } from "@plumix/blocks";

import {
  computeVariationMergeAttrs,
  dispatchVariationInsert,
} from "./insert-variation.js";
import { PUCK_ROOT_ZONE } from "./puck-zones.js";

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

function getSetDataReducer(
  action: PuckAction | undefined,
): (previous: Data) => Data {
  if (action?.type !== "setData") {
    throw new Error("expected setData dispatch");
  }
  return action.data as (previous: Data) => Data;
}

describe("dispatchVariationInsert", () => {
  test("dispatches a single `insert` for a bare entry with no attrs and no innerBlocks", () => {
    const dispatch = vi.fn<(action: PuckAction) => void>();
    const entry: InsertableBlockEntry = {
      name: "core/rich-text",
      slug: "core/rich-text",
      title: "Rich text",
    };
    dispatchVariationInsert(dispatch, entry, 0);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
      type: "insert",
      componentType: "core/rich-text",
      destinationZone: PUCK_ROOT_ZONE,
      destinationIndex: 0,
    });
  });

  test("setData merge overlays the variation attrs at the supplied index, after the insert", () => {
    const dispatch = vi.fn<(action: PuckAction) => void>();
    const entry: InsertableBlockEntry = {
      name: "core/list",
      slug: "core/list/bullet",
      title: "Bulleted",
      attrs: { variant: "bullet" },
    };
    dispatchVariationInsert(dispatch, entry, 1);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]?.[0]?.type).toBe("insert");
    const reduce = getSetDataReducer(dispatch.mock.calls[1]?.[0]);
    const previous: Data = {
      content: [
        { type: "x", props: { id: "x-0" } },
        { type: "core/list", props: { id: "list-1" } },
      ],
      root: { props: {} },
    };
    const next = reduce(previous);
    expect((next.content[1]?.props as { variant?: string }).variant).toBe(
      "bullet",
    );
  });

  test("converts innerBlocks to ComponentData[] under the conventional `content` slot", () => {
    const dispatch = vi.fn<(action: PuckAction) => void>();
    const entry: InsertableBlockEntry = {
      name: "core/group",
      slug: "core/group/with-heading",
      title: "Group with heading",
      innerBlocks: [{ id: "h1", name: "core/heading", attrs: { level: 2 } }],
    };
    dispatchVariationInsert(dispatch, entry, 0);
    const reduce = getSetDataReducer(dispatch.mock.calls[1]?.[0]);
    const previous: Data = {
      content: [{ type: "core/group", props: { id: "group-0" } }],
      root: { props: {} },
    };
    const next = reduce(previous);
    const slot = (next.content[0]?.props as { content?: readonly unknown[] })
      .content;
    expect(Array.isArray(slot)).toBe(true);
    expect((slot as readonly { type: string }[])[0]?.type).toBe("core/heading");
  });
});
