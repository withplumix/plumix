import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ComboboxField } from "./combobox-field.js";

const OPTIONS = [
  { label: "TypeScript", value: "typescript" },
  { label: "Rust", value: "rust" },
];

afterEach(cleanup);

describe("ComboboxField", () => {
  test("displays a stored value even when it isn't in the suggestion list", () => {
    render(
      <ComboboxField
        value="ts"
        options={OPTIONS}
        onChange={vi.fn()}
        testId="combo"
      />,
    );
    // The select this replaced would show blank for an out-of-list value;
    // the combobox shows the real stored value.
    expect(screen.getByTestId("combo")).toHaveValue("ts");
  });

  test("emits the raw typed value so any language is preserved", async () => {
    const onChange = vi.fn();
    render(
      <ComboboxField
        value=""
        options={OPTIONS}
        onChange={onChange}
        testId="combo"
      />,
    );
    // Controlled with a fixed empty value, so each keystroke emits that
    // single char — enough to prove the raw string flows through onChange
    // unfiltered (no option-list constraint).
    await userEvent.type(screen.getByTestId("combo"), "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });
});
