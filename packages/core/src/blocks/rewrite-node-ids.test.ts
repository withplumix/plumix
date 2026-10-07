import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry, defineBlock } from "./block-registry.js";
import { groupBlock } from "./group/index.js";
import { rewriteBlockNodeIds } from "./rewrite-node-ids.js";

const blocks = createBlockRegistry([
  groupBlock,
  defineBlock({ name: "acme/team", render: () => null }),
]);

const heading = (id: string, text: string): BlockNode => ({
  id,
  name: "core/heading",
  attrs: { text },
});

describe("rewriteBlockNodeIds", () => {
  test("replaces every node id with a fresh, non-empty string", () => {
    const input: readonly BlockNode[] = [
      heading("p1", "A"),
      heading("p2", "B"),
    ];

    const out = rewriteBlockNodeIds(input, blocks);

    expect(out).toHaveLength(2);
    expect(out[0]?.id).not.toBe("p1");
    expect(out[1]?.id).not.toBe("p2");
    expect(out[0]?.id.length).toBeGreaterThan(0);
    expect(out[1]?.id.length).toBeGreaterThan(0);
  });

  test("produces ids that are unique within the rewritten tree", () => {
    const input: readonly BlockNode[] = [
      heading("p1", "A"),
      heading("p1", "B"),
      heading("p1", "C"),
    ];

    const out = rewriteBlockNodeIds(input, blocks);
    const ids = out.map((n) => n.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("recurses into slot children carried inside attrs", () => {
    const input: readonly BlockNode[] = [
      {
        id: "group-1",
        name: "core/group",
        attrs: {
          layout: "stack",
          content: [heading("h-1", "Inner"), heading("h-2", "Inner 2")],
        },
      },
    ];

    const out = rewriteBlockNodeIds(input, blocks);
    const root = out[0];
    const innerContent = root?.attrs?.content as readonly BlockNode[];

    expect(root?.id).not.toBe("group-1");
    expect(innerContent[0]?.id).not.toBe("h-1");
    expect(innerContent[1]?.id).not.toBe("h-2");

    const allIds = [
      root?.id,
      innerContent[0]?.id,
      innerContent[1]?.id,
    ] as string[];
    expect(new Set(allIds).size).toBe(3);
  });

  test("does not mutate the input tree or its nested slot arrays", () => {
    const slotChild = heading("h-orig", "Inner");
    const root: BlockNode = {
      id: "g-orig",
      name: "core/group",
      attrs: { content: [slotChild] },
    };
    const input: readonly BlockNode[] = [root];
    const snapshot = JSON.stringify(input);

    rewriteBlockNodeIds(input, blocks);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(root.id).toBe("g-orig");
    expect(slotChild.id).toBe("h-orig");
  });

  test("repeated calls on the same input produce distinct id sets", () => {
    const input: readonly BlockNode[] = [
      heading("p1", "A"),
      heading("p2", "B"),
    ];

    const first = rewriteBlockNodeIds(input, blocks).map((n) => n.id);
    const second = rewriteBlockNodeIds(input, blocks).map((n) => n.id);

    expect(first).not.toEqual(second);
  });

  test("preserves the `style` slot at both top-level and inside nested slot children", () => {
    const innerStyle = { large: { "color.background": "primary" } };
    const rootStyle = { large: { "spacing.padding": "lg" } };
    const input: readonly BlockNode[] = [
      {
        id: "g-1",
        name: "core/group",
        style: rootStyle,
        attrs: {
          content: [
            { id: "h-1", name: "core/heading", style: innerStyle, attrs: {} },
          ],
        },
      },
    ];

    const out = rewriteBlockNodeIds(input, blocks);
    const root = out[0];
    const innerContent = root?.attrs?.content as readonly BlockNode[];

    expect(root?.style).toEqual(rootStyle);
    expect(innerContent[0]?.style).toEqual(innerStyle);
  });

  test.each([
    ["an empty data array", []],
    ["a data array of id/name objects", [{ id: "1", name: "Alice" }]],
  ])("leaves %s in an attr no slot declares as stored", (_, people) => {
    const input: readonly BlockNode[] = [
      { id: "t1", name: "acme/team", attrs: { people } },
    ];

    const out = rewriteBlockNodeIds(input, blocks);

    expect(out[0]?.attrs?.people).toEqual(people);
  });

  test("leaves an unregistered block's children as stored", () => {
    const content = [heading("h-1", "Inner")];
    const input: readonly BlockNode[] = [
      { id: "u1", name: "acme/missing", attrs: { content } },
    ];

    const out = rewriteBlockNodeIds(input, blocks);

    expect(out[0]?.attrs?.content).toEqual(content);
  });
});
