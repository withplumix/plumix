import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { BlockVariation } from "@plumix/blocks";
import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import { VariationThumbnail } from "./VariationThumbnail.js";

afterEach(() => {
  cleanup();
});

const blocks = createBlockRegistry([]);
const patterns = createPatternRegistry([]);

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
        blocks={blocks}
        patterns={patterns}
      />,
    );
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/columns:two-up"),
    ).toBeDefined();
  });
});
