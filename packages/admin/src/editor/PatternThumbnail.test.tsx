import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { PatternManifestEntry } from "@plumix/core/manifest";
import {
  createBlockRegistry,
  createPatternRegistry,
  defineBlock,
} from "@plumix/blocks";

import { PatternThumbnail } from "./PatternThumbnail.js";

afterEach(() => {
  cleanup();
});

const blank: PatternManifestEntry = {
  name: "x/blank",
  title: "Blank",
  content: [],
};

const heading = defineBlock({
  name: "core/heading",
  render: ({ attrs }) => {
    const text = (attrs as { readonly text?: string }).text ?? "";
    return <h1>{text}</h1>;
  },
});
const blocks = createBlockRegistry([heading]);
const patterns = createPatternRegistry([]);

describe("PatternThumbnail", () => {
  test("renders an <img> when the pattern declares a preview override", () => {
    const pattern: PatternManifestEntry = {
      ...blank,
      preview: {
        src: "/hero.png",
        width: 1400,
        height: 900,
        alt: "Hero preview",
      },
    };

    render(
      <PatternThumbnail
        pattern={pattern}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    const img = screen.getByTestId(`plumix-pattern-thumbnail-${pattern.name}`);
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "/hero.png");
    expect(img).toHaveAttribute("width", "1400");
    expect(img).toHaveAttribute("height", "900");
    expect(img).toHaveAttribute("alt", "Hero preview");
  });

  test("renders the pattern body via the walker when no preview override is set", () => {
    const pattern: PatternManifestEntry = {
      name: "x/live",
      title: "Live",
      content: [
        { id: "h", name: "core/heading", attrs: { text: "Live render" } },
      ],
    };

    render(
      <PatternThumbnail
        pattern={pattern}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    const container = screen.getByTestId(
      `plumix-pattern-thumbnail-${pattern.name}`,
    );
    expect(container).toHaveTextContent("Live render");
  });
});
