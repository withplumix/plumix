import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import type { SlashMenuItem } from "./slash-menu-items.js";
import { installFakeIntersectionObserver } from "./intersection-observer-harness.js";
import { SlashMenuPanel } from "./SlashMenuPanel.js";

const { intersect } = installFakeIntersectionObserver();

afterEach(() => {
  cleanup();
});

const blocks = createBlockRegistry([]);
const patterns = createPatternRegistry([]);

const heading: SlashMenuItem = {
  kind: "block",
  entry: {
    name: "core/heading",
    slug: "core/heading",
    title: "Heading",
    description: "Section title",
    category: "typography",
  },
};

const quote: SlashMenuItem = {
  kind: "block",
  entry: {
    name: "core/quote",
    slug: "core/quote",
    title: "Quote",
    description: "Pull quote",
    category: "typography",
  },
};

const heroPattern: SlashMenuItem = {
  kind: "pattern",
  entry: {
    name: "starter/hero",
    title: "Hero",
    category: "hero",
    content: [],
  },
};

// `expandBlockVariations` emits the variation's own raw slug — keep the
// fixture aligned with production output (see InsertableEntryRow.tsx).
const bulletListVariation: SlashMenuItem = {
  kind: "block",
  entry: {
    name: "core/list",
    slug: "bullet",
    title: "Bulleted list",
    attrs: { variant: "bullet" },
    category: "lists",
  },
};

const noop = vi.fn();

describe("SlashMenuPanel", () => {
  test("two variations sharing a slug across different parents get distinct testids", () => {
    const listBullet: SlashMenuItem = {
      kind: "block",
      entry: {
        name: "core/list",
        slug: "bullet",
        title: "Bulleted list",
        category: "lists",
      },
    };
    const tabsBullet: SlashMenuItem = {
      kind: "block",
      entry: {
        name: "core/tabs",
        slug: "bullet",
        title: "Bulleted tabs",
        category: "tabs",
      },
    };
    render(
      <SlashMenuPanel
        items={[listBullet, tabsBullet]}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );
    expect(
      screen.getByTestId("slash-menu-item-core/list/bullet"),
    ).toBeDefined();
    expect(
      screen.getByTestId("slash-menu-item-core/tabs/bullet"),
    ).toBeDefined();
  });

  test("marks pattern entries with a distinct card-style testid", () => {
    render(
      <SlashMenuPanel
        items={[heading, heroPattern]}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    // Blocks keep the single-line row id; patterns get a card id.
    expect(screen.getByTestId("slash-menu-item-core/heading")).toBeDefined();
    expect(
      screen.getByTestId("slash-menu-pattern-card-starter/hero"),
    ).toBeDefined();
  });

  test("renders one item per resolved entry with stable testids and category headings", () => {
    render(
      <SlashMenuPanel
        items={[heading, quote]}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    expect(screen.getByTestId("slash-menu-item-core/heading")).toBeDefined();
    expect(screen.getByTestId("slash-menu-item-core/quote")).toBeDefined();
    expect(screen.getByTestId("slash-menu-group-typography")).toBeDefined();
  });

  test("renders an empty-state when no items resolve", () => {
    render(
      <SlashMenuPanel
        items={[]}
        query="xyz"
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    expect(screen.getByTestId("slash-menu-empty")).toBeDefined();
  });

  test("calls onSelect with the clicked item", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <SlashMenuPanel
        items={[heading, quote]}
        query=""
        onQueryChange={noop}
        onSelect={onSelect}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    await user.click(screen.getByTestId("slash-menu-item-core/quote"));

    expect(onSelect).toHaveBeenCalledWith(quote);
  });

  test("calls onQueryChange when the input value changes", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SlashMenuPanel
        items={[heading]}
        query=""
        onQueryChange={onQueryChange}
        onSelect={noop}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    const input = screen.getByTestId("slash-menu-input");
    await user.click(input);
    await user.keyboard("h");

    expect(onQueryChange).toHaveBeenCalledWith("h");
  });

  test("calls onDismiss when Escape is pressed inside the panel", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <SlashMenuPanel
        items={[heading]}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={onDismiss}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    await user.click(screen.getByTestId("slash-menu-input"));
    await user.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("selects the highlighted item when Enter is pressed", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <SlashMenuPanel
        items={[heading, quote]}
        query=""
        onQueryChange={noop}
        onSelect={onSelect}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );

    await user.click(screen.getByTestId("slash-menu-input"));
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(heading);
  });

  test("variation block items get a lazy-mounted thumbnail placeholder before scroll-in", () => {
    render(
      <SlashMenuPanel
        items={[bulletListVariation]}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );
    expect(
      screen.getByTestId("slash-menu-thumbnail-placeholder-core/list:bullet"),
    ).toBeDefined();
    expect(
      screen.queryByTestId("plumix-variation-thumbnail-core/list:bullet"),
    ).toBeNull();
  });

  test("variation block items mount the live thumbnail once the placeholder intersects", () => {
    render(
      <SlashMenuPanel
        items={[bulletListVariation]}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={noop}
        blocks={blocks}
        patterns={patterns}
      />,
    );
    intersect();
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/list:bullet"),
    ).toBeDefined();
  });
});
