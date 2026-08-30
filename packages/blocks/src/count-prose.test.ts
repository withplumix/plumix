import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { blockTextRoster } from "./block-text.js";
import { coreBlocks } from "./core-blocks.js";
import { countProse } from "./count-prose.js";

// The reading-length count reads the same declarations the extractor does.
const roster = blockTextRoster(coreBlocks);
const count = (blocks: readonly BlockNode[]) => countProse(blocks, roster);

describe("countProse", () => {
  test("counts words and characters in a rich-text body, ignoring HTML tags", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "r1",
        name: "core/rich-text",
        attrs: { body: "<p>Hello <strong>world</strong></p>" },
      },
    ];
    // "Hello world" after tag-strip: 2 words, 11 chars (space counted).
    expect(count(blocks)).toEqual({ words: 2, characters: 11 });
  });

  test("counts headings and quotes inside rich-text bodies, summing across blocks", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "r1",
        name: "core/rich-text",
        attrs: { body: "<h2>Big Title</h2>" },
      },
      {
        id: "r2",
        name: "core/rich-text",
        attrs: { body: "<p>one two three</p>" },
      },
      {
        id: "r3",
        name: "core/rich-text",
        attrs: { body: "<blockquote>a quote</blockquote>" },
      },
    ];
    // "Big Title" (2) + "one two three" (3) + "a quote" (2) = 7 words.
    expect(count(blocks).words).toBe(7);
  });

  test("counts CJK ideographs individually since they have no inter-word spaces", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "r1",
        name: "core/rich-text",
        attrs: { body: "<h2>你好世界</h2>" },
      },
    ];
    // 4 ideographs → 4 words (whitespace split would wrongly give 1).
    expect(count(blocks)).toEqual({ words: 4, characters: 4 });
  });

  test("counts details summaries and table cell text", () => {
    const blocks: readonly BlockNode[] = [
      { id: "d1", name: "core/details", attrs: { summary: "click to expand" } },
      { id: "tc", name: "core/table-cell", attrs: { text: "cell value" } },
    ];
    // "click to expand" (3) + "cell value" (2) = 5 words.
    expect(count(blocks).words).toBe(5);
  });

  test("excludes non-prose blocks like code", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/code",
        attrs: { text: "const x = 1;", language: "ts" },
      },
    ];
    expect(count(blocks)).toEqual({ words: 0, characters: 0 });
  });

  test("recurses into nested container blocks", () => {
    const blocks: readonly BlockNode[] = [
      {
        id: "g1",
        name: "core/group",
        attrs: {
          content: [
            {
              id: "r0",
              name: "core/rich-text",
              attrs: { body: "<h2>Nested heading</h2>" },
            },
            {
              id: "r1",
              name: "core/rich-text",
              attrs: { body: "<p>deep body</p>" },
            },
          ],
        },
      },
    ];
    // "Nested heading" (2) + "deep body" (2) = 4 words.
    expect(count(blocks).words).toBe(4);
  });

  test("handles a long run of stray '<' in linear time (no ReDoS)", () => {
    const body = `${"<".repeat(100000)}done`;
    const blocks: readonly BlockNode[] = [
      { id: "r1", name: "core/rich-text", attrs: { body } },
    ];
    const start = performance.now();
    const result = count(blocks);
    // Linear strip finishes near-instantly; quadratic backtracking would
    // not. Generous ceiling to stay non-flaky on slow CI.
    expect(performance.now() - start).toBeLessThan(1000);
    // The unclosed-tag run collapses away, leaving the trailing word.
    expect(result.words).toBe(1);
  });

  test("empty content counts as zero", () => {
    expect(count([])).toEqual({ words: 0, characters: 0 });
    expect(
      count([{ id: "r1", name: "core/rich-text", attrs: { body: "<p></p>" } }]),
    ).toEqual({ words: 0, characters: 0 });
  });
});
