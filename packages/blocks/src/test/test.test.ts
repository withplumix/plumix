import { describe, expect, test } from "vitest";

import { paragraphBlock } from "../paragraph/index.js";
import {
  mockEditor,
  mockMarkRegistry,
  mockRegistry,
  renderBlock,
  validateContent,
} from "./index.js";

describe("mockRegistry", () => {
  test("returns an empty registry with no input", async () => {
    const reg = await mockRegistry();
    expect(reg.size).toBe(0);
    expect(reg.get("anything")).toBeUndefined();
  });

  test("seeds a single core block when supplied", async () => {
    const reg = await mockRegistry({ core: [paragraphBlock] });
    expect(reg.size).toBe(1);
    expect(reg.get("core/paragraph")?.name).toBe("core/paragraph");
  });
});

describe("renderBlock", () => {
  test("renders a paragraph to HTML", async () => {
    const registry = await mockRegistry({ core: [paragraphBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/paragraph",
            content: [{ type: "text", text: "Hi" }],
          },
        ],
      },
    });
    expect(html).toBe("<p>Hi</p>");
  });

  test("accepts a custom context", async () => {
    const registry = await mockRegistry({ core: [paragraphBlock] });
    const html = renderBlock({
      registry,
      content: { type: "core/paragraph", content: [] },
      context: {
        entry: null,
        siteSettings: {},
        theme: { id: "acme" },
        parent: null,
        depth: 0,
      },
    });
    expect(html).toBe("<p></p>");
  });
});

describe("validateContent", () => {
  test("returns ok for an empty doc against an empty registry", async () => {
    const blocks = await mockRegistry();
    const marks = await mockMarkRegistry();
    const result = validateContent(
      { type: "doc", content: [] },
      { blocks, marks },
    );
    expect(result).toEqual({ ok: true });
  });

  test("flags an unknown block type as not ok", async () => {
    const blocks = await mockRegistry({ core: [paragraphBlock] });
    const marks = await mockMarkRegistry();
    const result = validateContent(
      {
        type: "doc",
        content: [{ type: "acme/never-registered", content: [] }],
      },
      { blocks, marks },
    );
    expect(result.ok).toBe(false);
  });
});

describe("mockEditor", () => {
  test("ships the baseline ProseMirror schema", () => {
    const editor = mockEditor();
    expect(editor.schema.nodes.doc).toBeDefined();
    expect(editor.schema.nodes.paragraph).toBeDefined();
    editor.destroy();
  });
});
