import type { BlockNode } from "@plumix/blocks";
import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import {
  blockNodesToPuckContent,
  isV2EntryContent,
  seedPuckData,
} from "./v2-entry-content.js";

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
});

describe("isV2EntryContent", () => {
  test("accepts the canonical plumix.v2 envelope", () => {
    expect(
      isV2EntryContent({
        version: "plumix.v2",
        blocks: [{ id: "h1", name: "core/heading", attrs: { level: 2 } }],
      }),
    ).toBe(true);
  });

  test("accepts an empty blocks array", () => {
    expect(isV2EntryContent({ version: "plumix.v2", blocks: [] })).toBe(true);
  });

  test("rejects Tiptap-shaped content", () => {
    expect(
      isV2EntryContent({
        type: "doc",
        content: [{ type: "core/heading", attrs: { level: 2 } }],
      }),
    ).toBe(false);
  });

  test("rejects null, undefined, primitives, and arrays", () => {
    expect(isV2EntryContent(null)).toBe(false);
    expect(isV2EntryContent(undefined)).toBe(false);
    expect(isV2EntryContent("plumix.v2")).toBe(false);
    expect(isV2EntryContent([])).toBe(false);
  });

  test("rejects missing or wrong version", () => {
    expect(isV2EntryContent({ blocks: [] })).toBe(false);
    expect(isV2EntryContent({ version: "plumix.v1", blocks: [] })).toBe(false);
  });

  test("rejects malformed blocks (entries missing id or name)", () => {
    expect(
      isV2EntryContent({ version: "plumix.v2", blocks: [{ name: "x" }] }),
    ).toBe(false);
    expect(
      isV2EntryContent({ version: "plumix.v2", blocks: [{ id: "x" }] }),
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
