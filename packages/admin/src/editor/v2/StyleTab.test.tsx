import type { ThemeTokens } from "@plumix/blocks";
import type { ComponentData } from "@puckeditor/core";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

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
    render(
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
    render(
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
    render(
      <StyleTab
        tokens={tokens}
        selectedItem={makeItem()}
        bucket="small"
        onStyleChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("style-tab-active-bucket").textContent,
    ).toContain("Mobile");
  });

  test("seeds the dropdown from the active bucket's stored token id", () => {
    render(
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
    render(
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
    render(
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
    render(
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
});
