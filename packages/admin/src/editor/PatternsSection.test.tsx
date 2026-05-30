import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PatternsSection } from "./PatternsSection.js";

afterEach(() => {
  cleanup();
});

const noop = vi.fn();

describe("PatternsSection", () => {
  test("renders nothing when no patterns are registered", () => {
    const { container } = render(
      <PatternsSection patterns={[]} onSelect={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders title rows for each pattern, grouped under category headers", () => {
    render(
      <PatternsSection
        onSelect={noop}
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
        onSelect={noop}
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

  test("clicking a pattern row invokes onSelect with the pattern entry", async () => {
    const onSelect = vi.fn();
    const hero = {
      name: "starter/hero",
      title: "Hero",
      category: "hero" as const,
      content: [],
    };
    render(<PatternsSection patterns={[hero]} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByTestId("plumix-patterns-row-starter/hero"),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(hero);
  });
});
