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
  test("renders the spec's component wrapped in the walker div", () => {
    const html = renderBlockSpecToHtml(sampleHeading, {
      level: 2,
      text: "Hello",
    });

    expect(html).toBe(
      "<div>" + '<span data-test-tag="h2">Hello</span>' + "</div>",
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
