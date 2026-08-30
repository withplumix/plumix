import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { defineBlock } from "./block-registry.js";
import {
  blockTextRoster,
  blockTextVersion,
  extractBlockText,
} from "./block-text.js";

const noRender = () => null;

const proseBlock = defineBlock({
  name: "test/prose",
  render: noRender,
  text: [{ name: "body", html: true }],
});

const labelBlock = defineBlock({
  name: "test/label",
  render: noRender,
  text: [{ name: "label", prose: false }],
});

const wrapperBlock = defineBlock({
  name: "test/wrapper",
  render: noRender,
});

const roster = blockTextRoster([proseBlock, labelBlock, wrapperBlock]);

describe("extractBlockText", () => {
  test("reads a declared HTML input with its tags stripped", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "r1",
        name: "test/prose",
        attrs: { body: "<p>Hello <strong>world</strong></p>" },
      },
    ];
    expect(extractBlockText(blocks, roster)).toBe("Hello world");
  });

  test("decodes the entities a contenteditable emits", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "r1",
        name: "test/prose",
        attrs: { body: "<p>Ben &amp; Jerry&#39;s &lt;tag&gt;</p>" },
      },
    ];
    expect(extractBlockText(blocks, roster)).toBe("Ben & Jerry's <tag>");
  });

  test("reads a plain-text input verbatim, tags and all", () => {
    const blocks: readonly BlockNode[] = [
      { id: "l1", name: "test/label", attrs: { label: " Read <more> " } },
    ];
    expect(extractBlockText(blocks, roster)).toBe("Read <more>");
  });

  test("walks nested slots, keeping document order", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "w1",
        name: "test/wrapper",
        attrs: {
          content: [
            { id: "p1", name: "test/prose", attrs: { body: "<p>outer</p>" } },
            {
              id: "w2",
              name: "test/wrapper",
              attrs: {
                content: [
                  {
                    id: "p2",
                    name: "test/prose",
                    attrs: { body: "<p>inner</p>" },
                  },
                ],
              },
            },
          ],
        },
      },
    ];
    expect(extractBlockText(blocks, roster)).toBe("outer\ninner");
  });

  test("drops script and style bodies, not just their tags", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "p1",
        name: "test/prose",
        attrs: {
          body: "<style>.a{color:red}</style><script>alert(1)</script><p>Real</p>",
        },
      },
    ];
    expect(extractBlockText(blocks, roster)).toBe("Real");
  });

  test("an unclosed script swallows the rest, as a parser would", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "p1",
        name: "test/prose",
        attrs: { body: "<p>Before</p><script>alert(1)" },
      },
    ];
    expect(extractBlockText(blocks, roster)).toBe("Before");
  });

  test("leaves a numeric entity past the Unicode ceiling alone", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "p1",
        name: "test/prose",
        attrs: { body: "<p>&#1114112; and &#x110000;</p>" },
      },
    ];
    expect(extractBlockText(blocks, roster)).toBe("&#1114112; and &#x110000;");
  });

  test("a block that declares nothing contributes no text", () => {
    const blocks: readonly BlockNode[] = [
      { id: "w1", name: "test/wrapper", attrs: { heading: "not declared" } },
      { id: "u1", name: "test/unregistered", attrs: { body: "<p>gone</p>" } },
    ];
    expect(extractBlockText(blocks, roster)).toBe("");
  });

  test("skips inputs whose stored value is not a string", () => {
    const blocks: readonly BlockNode[] = [
      { id: "p1", name: "test/prose", attrs: { body: 42 } },
      { id: "p2", name: "test/prose", attrs: {} },
    ];
    expect(extractBlockText(blocks, roster)).toBe("");
  });

  test("handles a long run of stray '<' in linear time (no ReDoS)", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "p1",
        name: "test/prose",
        attrs: { body: `${"<".repeat(100000)}done` },
      },
    ];
    const start = performance.now();
    // Unclosed, so nothing is a tag: the run survives verbatim.
    expect(extractBlockText(blocks, roster).endsWith("<done")).toBe(true);
    // Linear strip finishes near-instantly; quadratic backtracking would
    // not. Generous ceiling to stay non-flaky on slow CI.
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("blockTextVersion", () => {
  test("a re-registered block that declares nothing drops the old roster", () => {
    const silenced = defineBlock({ name: "test/prose", render: noRender });
    expect(blockTextRoster([proseBlock, silenced]).has("test/prose")).toBe(
      false,
    );
  });

  test("is stable across registration order", () => {
    expect(blockTextVersion(blockTextRoster([proseBlock, labelBlock]))).toBe(
      blockTextVersion(blockTextRoster([labelBlock, proseBlock])),
    );
  });

  test("changes when a block adds a text input", () => {
    const widened = defineBlock({
      name: "test/prose",
      render: noRender,
      text: [
        { name: "body", html: true },
        { name: "caption", prose: false },
      ],
    });
    expect(blockTextVersion(blockTextRoster([widened]))).not.toBe(
      blockTextVersion(blockTextRoster([proseBlock])),
    );
  });

  test("changes when an input's encoding changes", () => {
    const plain = defineBlock({
      name: "test/prose",
      render: noRender,
      text: [{ name: "body" }],
    });
    expect(blockTextVersion(blockTextRoster([plain]))).not.toBe(
      blockTextVersion(blockTextRoster([proseBlock])),
    );
  });

  test("changes when an input stops being body copy", () => {
    const ancillary = defineBlock({
      name: "test/prose",
      render: noRender,
      text: [{ name: "body", html: true, prose: false }],
    });
    expect(blockTextVersion(blockTextRoster([ancillary]))).not.toBe(
      blockTextVersion(blockTextRoster([proseBlock])),
    );
  });

  test("ignores declarations that only spell out a default", () => {
    const explicit = defineBlock({
      name: "test/prose",
      render: noRender,
      text: [{ name: "body", html: true, prose: true }],
    });
    expect(blockTextVersion(blockTextRoster([explicit]))).toBe(
      blockTextVersion(blockTextRoster([proseBlock])),
    );
  });

  test("survives a roster large enough to collide a narrow digest", () => {
    const versions = new Set(
      Array.from({ length: 500 }, (_, i) =>
        blockTextVersion(
          blockTextRoster([
            defineBlock({
              name: `test/block-${String(i)}`,
              render: noRender,
              text: [{ name: "body", html: true }],
            }),
          ]),
        ),
      ),
    );
    expect(versions.size).toBe(500);
  });

  test("ignores blocks that declare no text", () => {
    expect(blockTextVersion(blockTextRoster([proseBlock, wrapperBlock]))).toBe(
      blockTextVersion(blockTextRoster([proseBlock])),
    );
  });
});
