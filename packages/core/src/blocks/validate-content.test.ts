import { describe, expect, test } from "vitest";

import type { BlockSpec } from "./block-registry.js";
import type { EntryContent } from "./entry-content.js";
import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { richTextBlock } from "./rich-text/index.js";
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
    if (name === "core/rich-text") return leaf(name);
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
  richTextBlock,
]);

describe("validateEntryContent", () => {
  test("accepts a valid leaf-block envelope", () => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [
          {
            id: "h1",
            name: "core/rich-text",
            attrs: { body: "<h2>Hi</h2>" },
          },
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
                  name: "core/rich-text",
                  attrs: { body: "<h3>Inside group</h3>" },
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

  test.each([
    ["an empty data array", []],
    ["a data array of id/name objects", [{ id: "1", name: "Alice" }]],
  ])("accepts %s in an attr no slot declares", (_, people) => {
    const result = validateEntryContent(
      {
        version: "plumix.v2",
        blocks: [{ id: "t1", name: "core/rich-text", attrs: { people } }],
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
                  name: "core/rich-text",
                  attrs: { body: "<h2>nope</h2>" },
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
        nodeName: "core/rich-text",
        slotName: "rows",
        path: "blocks[0].rows[0]",
      }),
    );
  });

  describe("requiresParent", () => {
    const reg = createBlockRegistry([
      richTextBlock,
      {
        name: "core/group",
        render: () => null,
        inputs: [{ name: "content", type: "slot" }],
      },
      {
        name: "core/buttons",
        render: () => null,
        inputs: [{ name: "items", type: "slot" }],
      },
      {
        name: "core/button",
        render: () => null,
        requiresParent: ["core/buttons"],
      },
    ]);

    test("rejects a requiresParent block at the top level", () => {
      const result = validateEntryContent(
        { version: "plumix.v2", blocks: [{ id: "b1", name: "core/button" }] },
        reg,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "requires_parent",
          nodeName: "core/button",
          path: "blocks[0]",
        }),
      );
    });

    test("rejects a requiresParent block under a non-matching parent", () => {
      const result = validateEntryContent(
        {
          version: "plumix.v2",
          blocks: [
            {
              id: "g1",
              name: "core/group",
              attrs: { content: [{ id: "b1", name: "core/button" }] },
            },
          ],
        },
        reg,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "requires_parent",
          nodeName: "core/button",
          path: "blocks[0].content[0]",
        }),
      );
    });

    test("accepts a requiresParent block under a matching parent", () => {
      const result = validateEntryContent(
        {
          version: "plumix.v2",
          blocks: [
            {
              id: "p1",
              name: "core/buttons",
              attrs: { items: [{ id: "b1", name: "core/button" }] },
            },
          ],
        },
        reg,
      );
      expect(result.ok).toBe(true);
    });
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

describe("validateEntryContent — the content a save starts from", () => {
  const v2 = (blocks: readonly BlockNode[]): EntryContent => ({
    version: "plumix.v2",
    blocks,
  });
  const orphan: BlockNode = { id: "o1", name: "acme/widget", attrs: {} };
  const rowWith = (cells: readonly BlockNode[]): BlockNode => ({
    id: "t1",
    name: "core/table",
    attrs: {
      rows: [
        { id: "r1", name: "core/table-body-row", attrs: { cells: [...cells] } },
      ],
    },
  });

  test("passes a stored node of an unregistered block", () => {
    expect(
      validateEntryContent(v2([orphan]), registry, [v2([orphan])]),
    ).toEqual({ ok: true });
  });

  test("still checks a stored node against its slot's allowedBlocks", () => {
    const cell: BlockNode = { id: "c1", name: "acme/widget", attrs: {} };
    const stored = v2([rowWith([cell])]);

    expect(validateEntryContent(stored, tableRegistry, [stored])).toMatchObject(
      {
        ok: false,
        errors: [
          { code: "disallowed_child", path: "blocks[0].rows[0].cells[0]" },
        ],
      },
    );
  });

  test("still checks the new children of a stored node", () => {
    const group: BlockNode = {
      id: "g1",
      name: "core/group",
      attrs: { content: [orphan] },
    };
    const result = validateEntryContent(v2([group]), registry, [
      v2([{ ...group, attrs: { content: [] } }]),
    ]);

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "unknown_block_type", path: "blocks[0].content[0]" }],
    });
  });

  test("lets a node shared by two starting contents through once", () => {
    const result = validateEntryContent(v2([orphan, orphan]), registry, [
      v2([orphan]),
      v2([orphan]),
    ]);

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "unknown_block_type", path: "blocks[1]" }],
    });
  });

  test("lets a node through as often as one starting content holds it", () => {
    const stored = v2([orphan, orphan]);

    expect(validateEntryContent(stored, registry, [stored])).toEqual({
      ok: true,
    });
  });
});
