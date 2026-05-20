import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import { mergePropsAtSelector } from "./merge-variation-attrs.js";
import { PUCK_ROOT_ZONE } from "./puck-zones.js";

function data(content: Data["content"]): Data {
  return { content, root: {} };
}

describe("mergePropsAtSelector", () => {
  test("merges attrs into the props of the root block at the given index", () => {
    const previous = data([
      { type: "core/list", props: { id: "l1" } },
    ]);
    const next = mergePropsAtSelector(
      previous,
      { zone: PUCK_ROOT_ZONE, index: 0 },
      { variant: "numbered" },
    );
    expect(next.content[0]).toEqual({
      type: "core/list",
      props: { id: "l1", variant: "numbered" },
    });
  });

  test("merges into a block inside a single-slot wrapper via <parentId>:<slotName> zones", () => {
    const previous = data([
      {
        type: "core/group",
        props: {
          id: "g1",
          content: [{ type: "core/list", props: { id: "l1" } }],
        },
      },
    ]);
    const next = mergePropsAtSelector(
      previous,
      { zone: "g1:content", index: 0 },
      { variant: "numbered" },
    );
    const slot = (next.content[0]?.props as { content?: { props: unknown }[] })
      .content;
    expect(slot?.[0]?.props).toEqual({ id: "l1", variant: "numbered" });
  });

  test("recurses arbitrarily deep through nested wrappers", () => {
    const previous = data([
      {
        type: "core/group",
        props: {
          id: "outer",
          content: [
            {
              type: "core/group",
              props: {
                id: "inner",
                content: [{ type: "core/list", props: { id: "l1" } }],
              },
            },
          ],
        },
      },
    ]);
    const next = mergePropsAtSelector(
      previous,
      { zone: "inner:content", index: 0 },
      { variant: "numbered" },
    );
    const outerSlot = (next.content[0]?.props as {
      content?: { props: { content?: { props: unknown }[] } }[];
    }).content;
    expect(outerSlot?.[0]?.props.content?.[0]?.props).toEqual({
      id: "l1",
      variant: "numbered",
    });
  });
});
