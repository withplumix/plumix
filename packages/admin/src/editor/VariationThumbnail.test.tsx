import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { BlockVariation } from "@plumix/blocks";
import {
  createBlockRegistry,
  createPatternRegistry,
  defineBlock,
} from "@plumix/blocks";

import { VariationThumbnail } from "./VariationThumbnail.js";

afterEach(() => {
  cleanup();
});

const emptyBlocks = createBlockRegistry([]);
const emptyPatterns = createPatternRegistry([]);

const realBlocks = createBlockRegistry([
  defineBlock({
    name: "x-test/group",
    title: "Group",
    inputs: [{ name: "content", type: "slot" }],
    render: ({ attrs }) => {
      const Content = attrs.content as (() => ReactElement) | undefined;
      return (
        <div data-testid="render-group">{Content ? <Content /> : null}</div>
      );
    },
  }),
  defineBlock({
    name: "x-test/leaf",
    title: "Leaf",
    inputs: [{ name: "label", type: "text" }],
    render: ({ attrs }) => (
      <span data-testid={`render-leaf-${String(attrs.label)}`}>
        {String(attrs.label)}
      </span>
    ),
  }),
]);

describe("VariationThumbnail", () => {
  test("emits a test-id keyed on parent block + variation slug", () => {
    const variation: BlockVariation = {
      slug: "two-up",
      title: "Two up",
      attrs: { layout: "split" },
    };
    render(
      <VariationThumbnail
        parentBlockName="core/columns"
        variation={variation}
        blocks={emptyBlocks}
        patterns={emptyPatterns}
      />,
    );
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/columns:two-up"),
    ).toBeDefined();
  });

  test("renders the runtime innerBlocks when no example override is set", () => {
    const variation: BlockVariation = {
      slug: "runtime",
      title: "Runtime",
      innerBlocks: [
        { id: "leaf-1", name: "x-test/leaf", attrs: { label: "runtime" } },
      ],
    };
    render(
      <VariationThumbnail
        parentBlockName="x-test/group"
        variation={variation}
        blocks={realBlocks}
        patterns={emptyPatterns}
      />,
    );
    expect(screen.getByTestId("render-leaf-runtime")).toBeDefined();
  });

  test("renders example.innerBlocks instead of variation.innerBlocks when both are set", () => {
    const variation: BlockVariation = {
      slug: "with-example",
      title: "With example",
      innerBlocks: [
        { id: "leaf-r", name: "x-test/leaf", attrs: { label: "runtime" } },
      ],
      example: {
        innerBlocks: [
          { id: "leaf-e", name: "x-test/leaf", attrs: { label: "example" } },
        ],
      },
    };
    render(
      <VariationThumbnail
        parentBlockName="x-test/group"
        variation={variation}
        blocks={realBlocks}
        patterns={emptyPatterns}
      />,
    );
    expect(screen.queryByTestId("render-leaf-runtime")).toBeNull();
    expect(screen.getByTestId("render-leaf-example")).toBeDefined();
  });
});
