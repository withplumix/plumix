import { describe, expect, test } from "vitest";

import { validateEntryContent } from "./validate-content.js";

const registry = {
  has(name: string): boolean {
    return name === "core/heading" || name === "core/group";
  },
};

describe("validateEntryContent", () => {
  test("accepts a valid leaf-block envelope", () => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [
          { id: "h1", name: "core/heading", attrs: { level: 2, text: "Hi" } },
        ],
      },
      registry,
    );
    expect(result).toEqual({ ok: true });
  });

  test("rejects an envelope with an unregistered top-level block name", () => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [
          { id: "x1", name: "acme/widget", attrs: {} },
        ],
      },
      registry,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      {
        code: "unknown_block_type",
        message: 'Unknown block type "acme/widget" at blocks[0].',
        path: "blocks[0]",
        nodeName: "acme/widget",
      },
    ]);
  });

  test("rejects an unregistered block name nested inside a slot child", () => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [
          {
            id: "g1",
            name: "core/group",
            attrs: {
              content: [
                { id: "x1", name: "acme/widget", attrs: {} },
              ],
            },
          },
        ],
      },
      registry,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      {
        code: "unknown_block_type",
        message: 'Unknown block type "acme/widget" at blocks[0].content[0].',
        path: "blocks[0].content[0]",
        nodeName: "acme/widget",
      },
    ]);
  });

  test("accepts an empty blocks array", () => {
    const result = validateEntryContent(
      { version: "plumix.v2", blocks: [] },
      registry,
    );
    expect(result).toEqual({ ok: true });
  });

  test("accepts a nested wrapper subtree where every name is registered", () => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [
          {
            id: "g1",
            name: "core/group",
            attrs: {
              content: [
                {
                  id: "h1",
                  name: "core/heading",
                  attrs: { level: 3, text: "Inside group" },
                },
              ],
            },
          },
        ],
      },
      registry,
    );
    expect(result).toEqual({ ok: true });
  });
});
