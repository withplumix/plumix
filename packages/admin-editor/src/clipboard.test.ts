import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import { parseClipboardBlocks, serializeBlocks } from "./clipboard.js";

const node: BlockNode = {
  id: "a",
  name: "core/heading",
  attrs: { text: "Hi", level: 2 },
};

describe("clipboard blocks", () => {
  test("round-trips serialized blocks back to the same nodes", () => {
    const text = serializeBlocks([node]);
    expect(parseClipboardBlocks(text)).toEqual([node]);
  });

  test("returns null for non-JSON clipboard text", () => {
    expect(parseClipboardBlocks("just some copied prose")).toBeNull();
  });

  test("returns null for foreign JSON without our envelope", () => {
    expect(parseClipboardBlocks(JSON.stringify({ blocks: [node] }))).toBeNull();
  });

  test("returns null when the payload's blocks aren't well-formed nodes", () => {
    const text = JSON.stringify({
      kind: "plumix/blocks",
      version: 1,
      blocks: [42, {}],
    });
    expect(parseClipboardBlocks(text)).toBeNull();
  });
});
