import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ThemeTokenGroup } from "@plumix/blocks";

import { TokenSwatchList } from "./TokenSwatchList.js";

afterEach(() => {
  cleanup();
});

const colorTokens: ThemeTokenGroup = {
  primary: { value: "#0070f3", label: "Primary" },
  danger: { value: "#e00", label: "Danger" },
};

describe("TokenSwatchList", () => {
  test("renders one radio per token plus a 'None' clear, inside a labelled radiogroup", () => {
    render(
      <TokenSwatchList
        tokens={colorTokens}
        value=""
        onChange={vi.fn()}
        testIdPrefix="bg"
        ariaLabel="Background color"
      />,
    );

    const group = screen.getByTestId("bg-list");
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(group.getAttribute("aria-label")).toBe("Background color");
    expect(screen.getByTestId("bg-clear")).toBeDefined();
    expect(screen.getByTestId("bg-token-primary")).toBeDefined();
    expect(screen.getByTestId("bg-token-danger")).toBeDefined();
  });

  test("emits the token's resolved CSS value as the swatch background-color", () => {
    render(
      <TokenSwatchList
        tokens={colorTokens}
        value=""
        onChange={vi.fn()}
        testIdPrefix="bg"
        ariaLabel="Background color"
      />,
    );

    const swatch = screen.getByTestId("bg-swatch-primary");
    expect(swatch.style.backgroundColor).toBe("rgb(0, 112, 243)");
  });

  test("marks the active token as the checked radio", () => {
    render(
      <TokenSwatchList
        tokens={colorTokens}
        value="primary"
        onChange={vi.fn()}
        testIdPrefix="bg"
        ariaLabel="Background color"
      />,
    );

    expect(
      screen.getByTestId<HTMLInputElement>("bg-token-primary").checked,
    ).toBe(true);
    expect(
      screen.getByTestId<HTMLInputElement>("bg-token-danger").checked,
    ).toBe(false);
  });

  test("invokes onChange with the token id when its swatch is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TokenSwatchList
        tokens={colorTokens}
        value=""
        onChange={onChange}
        testIdPrefix="bg"
        ariaLabel="Background color"
      />,
    );

    await user.click(screen.getByTestId("bg-token-danger"));

    expect(onChange).toHaveBeenCalledWith("danger");
  });

  test("invokes onChange with undefined when the 'None' radio is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TokenSwatchList
        tokens={colorTokens}
        value="primary"
        onChange={onChange}
        testIdPrefix="bg"
        ariaLabel="Background color"
      />,
    );

    await user.click(screen.getByTestId("bg-clear"));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
