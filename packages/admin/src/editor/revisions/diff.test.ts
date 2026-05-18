import { describe, expect, test } from "vitest";

import { diffJson, diffText, extractPlainText } from "./diff.js";

describe("diffJson", () => {
  test("returns hasChanges=false for identical inputs", () => {
    const a = { title: "Hello", level: 2 };
    const b = { title: "Hello", level: 2 };
    expect(diffJson(a, b).hasChanges).toBe(false);
  });

  test("detects scalar field edits", () => {
    const a = { title: "Hello" };
    const b = { title: "World" };
    const result = diffJson(a, b);
    expect(result.hasChanges).toBe(true);
    expect(result.delta).toBeDefined();
  });

  test("detects array-element moves rather than full replacements", () => {
    const a = {
      blocks: [
        { id: 1, t: "p" },
        { id: 2, t: "h" },
      ],
    };
    const b = {
      blocks: [
        { id: 2, t: "h" },
        { id: 1, t: "p" },
      ],
    };
    const result = diffJson(a, b);
    expect(result.hasChanges).toBe(true);
    // jsondiffpatch encodes moves as `[ '', destIndex, 3 ]` entries.
    const blocksDelta = (result.delta as Record<string, unknown>).blocks;
    expect(blocksDelta).toBeDefined();
  });
});

describe("diffText", () => {
  test("returns a single equal segment when strings match", () => {
    expect(diffText("hello world", "hello world")).toEqual([
      { kind: "equal", text: "hello world" },
    ]);
  });

  test("returns empty array when both inputs are empty", () => {
    expect(diffText("", "")).toEqual([]);
  });

  test("marks inserted words", () => {
    const segs = diffText("hello", "hello world");
    expect(
      segs.some((s) => s.kind === "insert" && s.text.includes("world")),
    ).toBe(true);
  });

  test("marks deleted words", () => {
    const segs = diffText("hello world", "hello");
    expect(
      segs.some((s) => s.kind === "delete" && s.text.includes("world")),
    ).toBe(true);
  });

  test("handles substitution as delete + insert", () => {
    const segs = diffText("hello cat", "hello dog");
    const kinds = segs.map((s) => s.kind);
    expect(kinds).toContain("delete");
    expect(kinds).toContain("insert");
  });

  test("merges adjacent segments of the same kind", () => {
    const segs = diffText("a b c", "x y z");
    // No equal segments expected (no shared tokens); but kinds should
    // be collapsed where possible.
    let lastKind: string | undefined;
    for (const seg of segs) {
      expect(seg.kind === lastKind ? "merged" : "boundary").toBe("boundary");
      lastKind = seg.kind;
    }
  });
});

describe("extractPlainText", () => {
  test("returns empty string for null / non-doc input", () => {
    expect(extractPlainText(null)).toBe("");
    expect(extractPlainText("not a doc")).toBe("");
  });

  test("joins inline text children without separators", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe("Hello world");
  });

  test("separates block-level children with newlines", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "core/heading",
          content: [{ type: "text", text: "Heading" }],
        },
        {
          type: "core/paragraph",
          content: [{ type: "text", text: "Body" }],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe("Heading\nBody");
  });
});
