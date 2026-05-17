import type { SlashMenuItem } from "@/editor/slash-menu/items-from-registry.js";
import { describe, expect, test } from "vitest";

import { slashMenuItemToContent } from "./tiptap-editor.js";

describe("slashMenuItemToContent", () => {
  test("block items insert as a bare node of the block's type", () => {
    const item: SlashMenuItem = {
      name: "core/paragraph",
      title: "Paragraph",
      category: "text",
    };
    expect(slashMenuItemToContent(item)).toEqual({ type: "core/paragraph" });
  });

  test("variation items insert as the parent's node type with preset attrs", () => {
    const item: SlashMenuItem = {
      name: "core/group:row",
      title: "Row",
      category: "layout",
      parent: "core/group",
      attributes: { layout: "flex-row" },
    };
    expect(slashMenuItemToContent(item)).toEqual({
      type: "core/group",
      attrs: { layout: "flex-row" },
    });
  });

  test("variation innerBlocks template materialises into Tiptap content", () => {
    const item: SlashMenuItem = {
      name: "core/columns:50-50",
      title: "Two columns 50/50",
      category: "layout",
      parent: "core/columns",
      attributes: { ratio: "1:1" },
      innerBlocks: [{ name: "core/column" }, { name: "core/column" }],
    };
    expect(slashMenuItemToContent(item)).toEqual({
      type: "core/columns",
      attrs: { ratio: "1:1" },
      content: [{ type: "core/column" }, { type: "core/column" }],
    });
  });

  test("recursively materialises nested innerBlocks", () => {
    const item: SlashMenuItem = {
      name: "core/columns:nested",
      title: "Nested",
      category: "layout",
      parent: "core/columns",
      attributes: { ratio: "1:1" },
      innerBlocks: [
        {
          name: "core/column",
          innerBlocks: [
            { name: "core/paragraph", attributes: { align: "left" } },
          ],
        },
      ],
    };
    expect(slashMenuItemToContent(item)).toEqual({
      type: "core/columns",
      attrs: { ratio: "1:1" },
      content: [
        {
          type: "core/column",
          content: [{ type: "core/paragraph", attrs: { align: "left" } }],
        },
      ],
    });
  });
});
