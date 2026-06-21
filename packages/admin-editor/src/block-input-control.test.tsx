import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { BlockInput } from "@plumix/blocks";

import { BlockInputControl } from "./block-input-control.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

function renderControl(input: BlockInput, value: unknown, onChange = vi.fn()) {
  const utils = render(
    <I18nProvider i18n={i18n}>
      <BlockInputControl input={input} value={value} onChange={onChange} />
    </I18nProvider>,
  );
  return { ...utils, onChange };
}

describe("BlockInputControl", () => {
  test("text input renders the value and emits edits", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "text", type: "text", label: "Heading" },
      "Hello",
    );
    const control = getByTestId("block-input-text") as HTMLInputElement;
    expect(control.value).toBe("Hello");

    fireEvent.change(control, { target: { value: "World" } });
    expect(onChange).toHaveBeenCalledWith("World");
  });

  test("textarea renders the value and emits edits", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "body", type: "textarea" },
      "one",
    );
    fireEvent.change(getByTestId("block-input-body"), {
      target: { value: "two" },
    });
    expect(onChange).toHaveBeenCalledWith("two");
  });

  test("number input emits a numeric value, null when cleared", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "level", type: "number" },
      2,
    );
    const control = getByTestId("block-input-level") as HTMLInputElement;
    expect(control.value).toBe("2");

    fireEvent.change(control, { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(3);

    fireEvent.change(control, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("checkbox reflects a boolean and emits a boolean", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "wide", type: "checkbox" },
      false,
    );
    fireEvent.click(getByTestId("block-input-wide"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("select preserves a numeric option value through the round trip", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "level",
        type: "select",
        options: [
          { label: "H2", value: 2 },
          { label: "H3", value: 3 },
        ],
      },
      2,
    );
    const control = getByTestId("block-input-level") as HTMLSelectElement;
    expect(control.value).toBe("2");

    fireEvent.change(control, { target: { value: "3" } });
    // Emits the number 3, not the string "3".
    expect(onChange).toHaveBeenCalledWith(3);
  });

  test("select preserves a boolean option value through the round trip", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "wide",
        type: "select",
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      },
      false,
    );
    fireEvent.change(getByTestId("block-input-wide"), {
      target: { value: "true" },
    });
    // Emits the boolean true, not the string "true".
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("number input clears to null on an unparseable value", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "level", type: "number" },
      2,
    );
    fireEvent.change(getByTestId("block-input-level"), {
      target: { value: "" },
    });
    // Never emits NaN — empty/unparseable clears to null.
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("radio selects an option and emits its typed value", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "align",
        type: "radio",
        options: [
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ],
      },
      "left",
    );
    fireEvent.click(getByTestId("block-input-align-right"));
    expect(onChange).toHaveBeenCalledWith("right");
  });

  test("combobox is free-text with option suggestions", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "tag",
        type: "combobox",
        options: [{ label: "News", value: "news" }],
      },
      "",
    );
    fireEvent.change(getByTestId("block-input-tag"), {
      target: { value: "custom" },
    });
    expect(onChange).toHaveBeenCalledWith("custom");
  });

  test("richtext renders the Tiptap toolbar and editable surface", () => {
    const { getByTestId } = renderControl(
      { name: "body", type: "richtext", label: "Body" },
      "<p>Hello</p>",
    );
    // The toolbar's formatting controls and the contenteditable surface mount.
    expect(getByTestId("block-input-body-bold")).toBeDefined();
    expect(getByTestId("block-input-body-h2")).toBeDefined();
    expect(getByTestId("block-input-body-clear")).toBeDefined();
    const editor = getByTestId("block-input-body-editor");
    expect(editor.getAttribute("contenteditable")).toBe("true");
    expect(editor.textContent).toContain("Hello");
  });

  test("falls back to a text input for an unknown kind", () => {
    const { getByTestId } = renderControl(
      { name: "mystery", type: "future-kind" },
      "x",
    );
    expect(getByTestId("block-input-mystery")).toBeDefined();
  });

  test("uses the input name as the label when none is given", () => {
    const { getByText } = renderControl({ name: "slug", type: "text" }, "");
    expect(getByText("slug")).toBeDefined();
  });
});
