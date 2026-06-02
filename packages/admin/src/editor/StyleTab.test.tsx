import type { ComponentData } from "@puckeditor/core";
import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ThemeTokens } from "@plumix/blocks";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { StyleTab } from "./StyleTab.js";

afterEach(() => {
  cleanup();
});

const tokens: ThemeTokens = {
  spacing: {
    sm: { value: "0.5rem", label: "Small" },
    md: { value: "1rem", label: "Medium" },
    lg: { value: "2rem", label: "Large" },
  },
};

function makeItem(props: Record<string, unknown> = {}): ComponentData {
  return {
    type: "core/heading",
    props: { id: "h1", ...props },
  };
}

describe("StyleTab", () => {
  test("renders the empty-state when no block is selected", () => {
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={null}
        bucket="large"
        onStyleChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("style-tab-empty")).toBeDefined();
  });

  test("lists every spacing token as a dropdown option (plus a 'None' clear)", () => {
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem()}
        bucket="large"
        onStyleChange={vi.fn()}
      />,
    );

    const select = screen.getByTestId("style-tab-padding-select");
    const optionValues = new Set(
      Array.from(select.querySelectorAll("option")).map((o) => o.value),
    );
    expect(optionValues).toEqual(new Set(["", "sm", "md", "lg"]));
  });

  test("renders the active bucket label so authors know which viewport they're editing", () => {
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem()}
        bucket="small"
        onStyleChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("style-tab-active-bucket").textContent).toContain(
      "Mobile",
    );
  });

  test("seeds the dropdown from the active bucket's stored token id", () => {
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem({ style: { large: { padding: "md" } } })}
        bucket="large"
        onStyleChange={vi.fn()}
      />,
    );

    const select = screen.getByTestId("style-tab-padding-select");
    expect((select as HTMLSelectElement).value).toBe("md");
  });

  test("editing on Desktop writes the new token id to style.large.padding", async () => {
    const onStyleChange = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem()}
        bucket="large"
        onStyleChange={onStyleChange}
      />,
    );

    await user.selectOptions(
      screen.getByTestId("style-tab-padding-select"),
      "lg",
    );

    expect(onStyleChange).toHaveBeenCalledWith({ large: { padding: "lg" } });
  });

  test("editing on Mobile writes the new token id to style.small.padding and preserves desktop", async () => {
    const onStyleChange = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem({ style: { large: { padding: "lg" } } })}
        bucket="small"
        onStyleChange={onStyleChange}
      />,
    );

    await user.selectOptions(
      screen.getByTestId("style-tab-padding-select"),
      "sm",
    );

    expect(onStyleChange).toHaveBeenCalledWith({
      large: { padding: "lg" },
      small: { padding: "sm" },
    });
  });

  test("selecting 'None' clears the property from the active bucket", async () => {
    const onStyleChange = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem({ style: { large: { padding: "md" } } })}
        bucket="large"
        onStyleChange={onStyleChange}
      />,
    );

    await user.selectOptions(
      screen.getByTestId("style-tab-padding-select"),
      "",
    );

    expect(onStyleChange).toHaveBeenCalledWith(undefined);
  });

  test("omits sections whose token category isn't declared on the theme", () => {
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem()}
        bucket="large"
        onStyleChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("style-tab-section-background")).toBeNull();
    expect(screen.queryByTestId("style-tab-section-color")).toBeNull();
    expect(screen.queryByTestId("style-tab-section-fontSize")).toBeNull();
    expect(screen.queryByTestId("style-tab-section-padding")).toBeDefined();
  });

  test("clicking a background swatch writes the token id to style.<bucket>.background", async () => {
    const fullTokens: ThemeTokens = {
      colors: { brand: { value: "#0070f3", label: "Brand" } },
    };
    const onStyleChange = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      <StyleTab
        tokens={fullTokens}
        selectedItem={makeItem()}
        bucket="medium"
        onStyleChange={onStyleChange}
      />,
    );

    await user.click(screen.getByTestId("style-tab-background-token-brand"));

    expect(onStyleChange).toHaveBeenCalledWith({
      medium: { background: "brand" },
    });
  });

  test("clicking a text-color swatch writes the token id to style.<bucket>.color", async () => {
    const fullTokens: ThemeTokens = {
      colors: { ink: { value: "#111", label: "Ink" } },
    };
    const onStyleChange = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      <StyleTab
        tokens={fullTokens}
        selectedItem={makeItem()}
        bucket="large"
        onStyleChange={onStyleChange}
      />,
    );

    await user.click(screen.getByTestId("style-tab-color-token-ink"));

    expect(onStyleChange).toHaveBeenCalledWith({
      large: { color: "ink" },
    });
  });

  test("clicking a section's trigger collapses its inner control", async () => {
    const onStyleChange = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem()}
        bucket="large"
        onStyleChange={onStyleChange}
      />,
    );

    expect(screen.getByTestId("style-tab-padding-select")).toBeDefined();

    await user.click(screen.getByTestId("style-tab-section-padding-trigger"));

    expect(screen.queryByTestId("style-tab-padding-select")).toBeNull();
  });

  test("selecting a font-size option writes the token id to style.<bucket>.fontSize", async () => {
    const fullTokens: ThemeTokens = {
      typography: { xl: { value: "1.5rem", label: "Extra large" } },
    };
    const onStyleChange = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      <StyleTab
        tokens={fullTokens}
        selectedItem={makeItem()}
        bucket="large"
        onStyleChange={onStyleChange}
      />,
    );

    await user.selectOptions(
      screen.getByTestId("style-tab-fontSize-select"),
      "xl",
    );

    expect(onStyleChange).toHaveBeenCalledWith({
      large: { fontSize: "xl" },
    });
  });
});
