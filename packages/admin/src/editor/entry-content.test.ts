import type { BlockNode } from "@plumix/blocks";
import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import {
  blockNodesToPuckContent,
  isEntryContent,
  seedPuckData,
} from "./entry-content.js";

describe("blockNodesToPuckContent", () => {
  test("converts a leaf BlockNode to a ComponentData with type + id-attrs in props", () => {
    const nodes: readonly BlockNode[] = [
      {
        id: "h1",
        name: "core/heading",
        attrs: { level: 2, text: "Hello" },
      },
    ];

    const content = blockNodesToPuckContent(nodes);

    expect(content).toEqual([
      {
        type: "core/heading",
        props: { id: "h1", level: 2, text: "Hello" },
      },
    ]);
  });

  test("passes node.style through into props.style", () => {
    const nodes: readonly BlockNode[] = [
      {
        id: "h1",
        name: "core/heading",
        attrs: { level: 2, text: "Hello" },
        style: { large: { padding: "md" } },
      },
    ];

    const content = blockNodesToPuckContent(nodes);

    expect(content[0]?.props).toEqual({
      id: "h1",
      level: 2,
      text: "Hello",
      style: { large: { padding: "md" } },
    });
  });

  test("omits props.style when the node has no style slot", () => {
    const nodes: readonly BlockNode[] = [
      {
        id: "h1",
        name: "core/heading",
        attrs: { level: 2 },
      },
    ];

    expect("style" in (blockNodesToPuckContent(nodes)[0]?.props ?? {})).toBe(
      false,
    );
  });

  test("recursively converts a single-slot wrapper's nested children", () => {
    const nodes: readonly BlockNode[] = [
      {
        id: "g1",
        name: "core/group",
        attrs: {
          content: [
            { id: "h1", name: "core/heading", attrs: { level: 2, text: "X" } },
          ],
        },
      },
    ];

    expect(blockNodesToPuckContent(nodes)).toEqual([
      {
        type: "core/group",
        props: {
          id: "g1",
          content: [
            { type: "core/heading", props: { id: "h1", level: 2, text: "X" } },
          ],
        },
      },
    ]);
  });

  test("converts independent slot arrays on a multi-slot parent", () => {
    const nodes: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/columns",
        attrs: {
          left: [
            { id: "lh", name: "core/heading", attrs: { level: 2, text: "L" } },
          ],
          right: [
            { id: "rh", name: "core/heading", attrs: { level: 2, text: "R" } },
          ],
        },
      },
    ];

    expect(blockNodesToPuckContent(nodes)).toEqual([
      {
        type: "core/columns",
        props: {
          id: "c1",
          left: [
            { type: "core/heading", props: { id: "lh", level: 2, text: "L" } },
          ],
          right: [
            { type: "core/heading", props: { id: "rh", level: 2, text: "R" } },
          ],
        },
      },
    ]);
  });

  test("walks slots arbitrarily deep", () => {
    const nodes: readonly BlockNode[] = [
      {
        id: "outer",
        name: "core/group",
        attrs: {
          content: [
            {
              id: "middle",
              name: "core/group",
              attrs: {
                content: [
                  {
                    id: "inner",
                    name: "core/heading",
                    attrs: { level: 3, text: "Deep" },
                  },
                ],
              },
            },
          ],
        },
      },
    ];

    expect(blockNodesToPuckContent(nodes)).toEqual([
      {
        type: "core/group",
        props: {
          id: "outer",
          content: [
            {
              type: "core/group",
              props: {
                id: "middle",
                content: [
                  {
                    type: "core/heading",
                    props: { id: "inner", level: 3, text: "Deep" },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
  });

  test("leaves non-slot arrays in attrs untouched", () => {
    const nodes: readonly BlockNode[] = [
      {
        id: "picker",
        name: "core/picker",
        attrs: { tags: [{ value: "foo" }, { value: "bar" }] },
      },
    ];

    expect(blockNodesToPuckContent(nodes)).toEqual([
      {
        type: "core/picker",
        props: { id: "picker", tags: [{ value: "foo" }, { value: "bar" }] },
      },
    ]);
  });
});

describe("isEntryContent", () => {
  test("accepts the canonical plumix.v2 envelope", () => {
    expect(
      isEntryContent({
        version: "plumix.v2",
        blocks: [{ id: "h1", name: "core/heading", attrs: { level: 2 } }],
      }),
    ).toBe(true);
  });

  test("accepts an empty blocks array", () => {
    expect(isEntryContent({ version: "plumix.v2", blocks: [] })).toBe(true);
  });

  test("rejects Tiptap-shaped content", () => {
    expect(
      isEntryContent({
        type: "doc",
        content: [{ type: "core/heading", attrs: { level: 2 } }],
      }),
    ).toBe(false);
  });

  test("rejects null, undefined, primitives, and arrays", () => {
    expect(isEntryContent(null)).toBe(false);
    expect(isEntryContent(undefined)).toBe(false);
    expect(isEntryContent("plumix.v2")).toBe(false);
    expect(isEntryContent([])).toBe(false);
  });

  test("rejects missing or wrong version", () => {
    expect(isEntryContent({ blocks: [] })).toBe(false);
    expect(isEntryContent({ version: "plumix.v1", blocks: [] })).toBe(false);
  });

  test("rejects malformed blocks (entries missing id or name)", () => {
    expect(
      isEntryContent({ version: "plumix.v2", blocks: [{ name: "x" }] }),
    ).toBe(false);
    expect(
      isEntryContent({ version: "plumix.v2", blocks: [{ id: "x" }] }),
    ).toBe(false);
  });
});

describe("seedPuckData", () => {
  const fallback: Data = { content: [], root: {} };

  test("uses server content when it has the v2 envelope", () => {
    const seeded = seedPuckData(
      {
        version: "plumix.v2",
        blocks: [
          { id: "h1", name: "core/heading", attrs: { level: 2, text: "Server" } },
        ],
      },
      fallback,
    );
    expect(seeded.content).toEqual([
      { type: "core/heading", props: { id: "h1", level: 2, text: "Server" } },
    ]);
  });

  test("returns the fallback when the content is not v2-shaped", () => {
    const seeded = seedPuckData(
      { type: "doc", content: [{ type: "core/heading" }] },
      fallback,
    );
    expect(seeded).toBe(fallback);
  });

  test("returns the fallback when content is null", () => {
    expect(seedPuckData(null, fallback)).toBe(fallback);
  });
});
