import { createRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SlashMenuItem } from "./items-from-registry.js";
import type { SlashMenuPanelHandle } from "./SlashMenuPanel.js";
import { SlashMenuPanel } from "./SlashMenuPanel.js";

afterEach(() => {
  cleanup();
});

const items: readonly SlashMenuItem[] = [
  {
    name: "core/heading",
    title: "Heading",
    category: "typography",
    keywords: ["h1", "h2"],
  },
  {
    name: "core/quote",
    title: "Quote",
    category: "typography",
    keywords: ["blockquote"],
  },
  { name: "core/columns", title: "Columns", category: "layout" },
];

describe("SlashMenuPanel", () => {
  test("renders one CommandItem per item with a data-testid anchor", () => {
    render(
      <SlashMenuPanel
        items={items}
        query=""
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    for (const item of items) {
      expect(
        screen.queryByTestId(`slash-menu-item-${item.name}`),
      ).toBeInTheDocument();
    }
  });

  test("groups items by category in the DOM", () => {
    render(
      <SlashMenuPanel
        items={items}
        query=""
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const headings = Array.from(
      document.querySelectorAll("[cmdk-group-heading]"),
    ).map((el) => el.textContent);
    expect(headings.sort()).toEqual(["layout", "typography"]);
  });

  test("clicking a CommandItem invokes onSelect with that item", () => {
    const onSelect = vi.fn();
    render(
      <SlashMenuPanel
        items={items}
        query=""
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("slash-menu-item-core/quote"));
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  test("filters items via cmdk when query changes (keywords match)", () => {
    const { rerender } = render(
      <SlashMenuPanel
        items={items}
        query="blockquote"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("slash-menu-item-core/quote"),
    ).toBeInTheDocument();
    // Heading should be filtered out by cmdk's value-based filter
    expect(screen.queryByTestId("slash-menu-item-core/heading")).toBeNull();

    rerender(
      <SlashMenuPanel
        items={items}
        query="col"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("slash-menu-item-core/columns"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("slash-menu-item-core/quote")).toBeNull();
  });

  test("shows the empty state when no item matches the query", () => {
    render(
      <SlashMenuPanel
        items={items}
        query="zzzz-nothing"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("slash-menu-empty")).toBeInTheDocument();
  });

  test("Enter via imperative onKeyDown selects the active item", () => {
    const onSelect = vi.fn();
    const ref = createRef<SlashMenuPanelHandle>();
    render(
      <SlashMenuPanel
        ref={ref}
        items={items}
        query=""
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );
    let handled = false;
    act(() => {
      handled =
        ref.current?.onKeyDown(
          new KeyboardEvent("keydown", { key: "Enter" }),
        ) ?? false;
    });
    expect(handled).toBe(true);
    expect(onSelect).toHaveBeenCalled();
  });

  test("Escape via imperative onKeyDown invokes onDismiss", () => {
    const onDismiss = vi.fn();
    const ref = createRef<SlashMenuPanelHandle>();
    render(
      <SlashMenuPanel
        ref={ref}
        items={items}
        query=""
        onSelect={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    let handled = false;
    act(() => {
      handled =
        ref.current?.onKeyDown(
          new KeyboardEvent("keydown", { key: "Escape" }),
        ) ?? false;
    });
    expect(handled).toBe(true);
    expect(onDismiss).toHaveBeenCalled();
  });

  test("unhandled keys return false (let editor consume them)", () => {
    const ref = createRef<SlashMenuPanelHandle>();
    render(
      <SlashMenuPanel
        ref={ref}
        items={items}
        query=""
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "a" })),
    ).toBe(false);
  });

  test("renders an aria-live region announcing the filtered count", () => {
    render(
      <SlashMenuPanel
        items={items}
        query=""
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const live = screen.getByTestId("slash-menu-live-region");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live.textContent).toMatch(/3 result/);
  });

  test("live region announces the QUERY-filtered count, not the unfiltered items length", () => {
    // Reflects what cmdk shows the user. The previous shape announced
    // the unfiltered count and stayed stuck at "3 results" while the
    // visible list shrank to 1 on the user's keystroke.
    render(
      <SlashMenuPanel
        items={items}
        query="quote"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("slash-menu-live-region").textContent).toMatch(
      /1 result/,
    );
  });

  test("live region updates when items array shrinks", () => {
    const { rerender } = render(
      <SlashMenuPanel
        items={items}
        query=""
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("slash-menu-live-region").textContent).toMatch(
      /3 result/,
    );
    const [firstItem] = items;
    if (!firstItem) throw new Error("expected at least one fixture item");
    rerender(
      <SlashMenuPanel
        items={[firstItem]}
        query="head"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("slash-menu-live-region").textContent).toMatch(
      /1 result/,
    );
  });
});
