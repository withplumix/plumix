import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { PatternsSection } from "./PatternsSection.js";

afterEach(() => {
  cleanup();
});

describe("PatternsSection", () => {
  test("renders nothing when no patterns are registered", () => {
    const { container } = render(<PatternsSection patterns={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders title rows for each pattern, grouped under category headers", () => {
    render(
      <PatternsSection
        patterns={[
          {
            name: "starter/hero",
            title: "Hero CTA",
            category: "hero",
            content: [],
          },
          {
            name: "starter/big-cta",
            title: "Big CTA",
            category: "cta",
            content: [],
          },
          {
            name: "starter/min-hero",
            title: "Minimal Hero",
            category: "hero",
            content: [],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("plumix-patterns-section")).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-group-hero"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plumix-patterns-group-cta")).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-starter/hero"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-starter/big-cta"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-starter/min-hero"),
    ).toBeInTheDocument();
  });

  test("patterns without a category fall under an 'uncategorized' group", () => {
    render(
      <PatternsSection
        patterns={[{ name: "x/anon", title: "Anonymous", content: [] }]}
      />,
    );

    expect(
      screen.getByTestId("plumix-patterns-group-uncategorized"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-patterns-row-x/anon"),
    ).toBeInTheDocument();
  });
});
