import type { BlockNode, BlockNodeRegistry } from "./render-block-tree.js";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { renderBlockTree } from "./render-block-tree.js";

const headingRegistry: BlockNodeRegistry = new Map([
  [
    "core/heading",
    ({ attrs }) => {
      const { text, level } = attrs as {
        readonly text: string;
        readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      };
      const Tag = `h${level}` as const;
      return <Tag>{text}</Tag>;
    },
  ],
]);

describe("renderBlockTree", () => {
  test("renders a single heading block with its text attribute", () => {
    const heading: BlockNode = {
      id: "abc",
      name: "core/heading",
      attrs: { text: "Hello, world", level: 2 },
    };

    const html = renderToStaticMarkup(
      renderBlockTree([heading], headingRegistry),
    );

    expect(html).toBe("<h2>Hello, world</h2>");
  });

  test("renders multiple sibling blocks in document order", () => {
    const blocks: readonly BlockNode[] = [
      { id: "1", name: "core/heading", attrs: { text: "First", level: 2 } },
      { id: "2", name: "core/heading", attrs: { text: "Second", level: 3 } },
      { id: "3", name: "core/heading", attrs: { text: "Third", level: 2 } },
    ];

    const html = renderToStaticMarkup(
      renderBlockTree(blocks, headingRegistry),
    );

    expect(html).toBe("<h2>First</h2><h3>Second</h3><h2>Third</h2>");
  });

  test("renders nothing for an unknown block name", () => {
    const unknown: BlockNode = {
      id: "x",
      name: "acme/missing",
      attrs: { foo: "bar" },
    };

    const html = renderToStaticMarkup(
      renderBlockTree([unknown], headingRegistry),
    );

    expect(html).toBe("");
  });

  test("renders nothing for an empty node array", () => {
    const html = renderToStaticMarkup(renderBlockTree([], headingRegistry));

    expect(html).toBe("");
  });

  test("known blocks render even when interleaved with unknown blocks", () => {
    const blocks: readonly BlockNode[] = [
      { id: "1", name: "core/heading", attrs: { text: "Before", level: 2 } },
      { id: "2", name: "acme/missing", attrs: {} },
      { id: "3", name: "core/heading", attrs: { text: "After", level: 2 } },
    ];

    const html = renderToStaticMarkup(
      renderBlockTree(blocks, headingRegistry),
    );

    expect(html).toBe("<h2>Before</h2><h2>After</h2>");
  });
});
