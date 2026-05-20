import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SlashMenuItem } from "./slash-menu-items.js";

import { SlashMenuPanel } from "./SlashMenuPanel.js";

afterEach(() => {
  cleanup();
});

const heading: SlashMenuItem = {
  name: "core/heading",
  slug: "core/heading",
  title: "Heading",
  description: "Section title",
  category: "typography",
};

const quote: SlashMenuItem = {
  name: "core/quote",
  slug: "core/quote",
  title: "Quote",
  description: "Pull quote",
  category: "typography",
};

const noop = vi.fn();

describe("SlashMenuPanel", () => {
  test("renders one item per resolved entry with stable testids and category headings", () => {
    render(
      <SlashMenuPanel
        items={[heading, quote]}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onDismiss={noop}
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
      />,
    );

    await user.click(screen.getByTestId("slash-menu-input"));
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(heading);
  });
});
