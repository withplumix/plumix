import { describe, expect, test } from "vitest";

import type { BlockSpec } from "./block-registry.js";
import { createBlockRegistry } from "./block-registry.js";
import { headingBlock } from "./heading/index.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./table/index.js";
import { validateEntryContent } from "./validate-content.js";

const leaf = (name: string): BlockSpec => ({ name, render: () => null });
const registry = {
  get(name: string): BlockSpec | undefined {
    if (name === "core/heading") return leaf(name);
    // A content slot with no `allowedBlocks` — unconstrained.
    if (name === "core/group")
      return {
        name,
        render: () => null,
        inputs: [{ name: "content", type: "slot" }],
      };
    return undefined;
  },
};

const tableRegistry = createBlockRegistry([
  tableBlock,
  tableHeaderRowBlock,
  tableBodyRowBlock,
  tableHeaderCellBlock,
  tableCellBlock,
  headingBlock,
]);

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
        blocks: [{ id: "x1", name: "acme/widget", attrs: {} }],
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
              content: [{ id: "x1", name: "acme/widget", attrs: {} }],
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

  test("rejects a child a slot's allowedBlocks doesn't permit", () => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [
          {
            id: "t1",
            name: "core/table",
            attrs: {
              rows: [
                {
                  id: "h1",
                  name: "core/heading",
                  attrs: { level: 2, text: "nope" },
                },
              ],
            },
          },
        ],
      },
      tableRegistry,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "disallowed_child",
        nodeName: "core/heading",
        slotName: "rows",
        path: "blocks[0].rows[0]",
      }),
    );
  });

  test("accepts a valid table tree", () => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [
          {
            id: "t1",
            name: "core/table",
            attrs: {
              rows: [
                {
                  id: "r1",
                  name: "core/table-body-row",
                  attrs: {
                    cells: [
                      {
                        id: "c1",
                        name: "core/table-cell",
                        attrs: { text: "x" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      tableRegistry,
    );
    expect(result).toEqual({ ok: true });
  });
});
