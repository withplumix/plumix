import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";

import type { BlockNode, BlockSpec } from "../index.js";
import { defineBlock } from "../index.js";
import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "./index.js";

const sampleHeading: BlockSpec = defineBlock({
  name: "sample/heading",
  title: "Sample Heading",
  defaults: { level: 2, text: "" },
  render: ({ attrs }): ReactNode => {
    const { level = 2, text = "" } = attrs as {
      readonly level?: number;
      readonly text?: string;
    };
    const tag = `h${level}`;
    return <span data-test-tag={tag}>{text}</span>;
  },
});

describe("renderBlockSpecToHtml", () => {
  test("renders the spec's component wrapped in the universal data-plumix-block div", () => {
    const html = renderBlockSpecToHtml(sampleHeading, {
      level: 2,
      text: "Hello",
    });

    expect(html).toBe(
      '<div data-plumix-block="sample/heading">' +
        '<span data-test-tag="h2">Hello</span>' +
        "</div>",
    );
  });

  test("threads RenderBlockTreeOptions.tokens through to style emission", () => {
    const sampleWithStyle: BlockSpec = defineBlock({
      name: "sample/styled",
      render: () => <span>x</span>,
    });

    const html = renderBlockSpecToHtml(
      sampleWithStyle,
      {},
      { tokens: { spacing: { lg: { value: "24px" } } } },
    );

    // No style declared on the node; nothing emitted regardless of tokens.
    expect(html).toBe(
      '<div data-plumix-block="sample/styled"><span>x</span></div>',
    );
  });
});

describe("renderBlockTreeToHtml", () => {
  test("renders multiple blocks against a multi-spec registry", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "1",
        name: "sample/heading",
        attrs: { level: 2, text: "First" },
      },
      {
        id: "2",
        name: "sample/heading",
        attrs: { level: 3, text: "Second" },
      },
    ];

    const html = renderBlockTreeToHtml([sampleHeading], tree);

    expect(html).toContain('data-test-tag="h2">First');
    expect(html).toContain('data-test-tag="h3">Second');
  });
});
