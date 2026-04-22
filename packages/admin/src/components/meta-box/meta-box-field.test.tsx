import type { ReactNode } from "react";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { MetaBoxField } from "./meta-box-field.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function field(
  overrides: Partial<MetaBoxFieldManifestEntry> & {
    inputType: string;
  },
): MetaBoxFieldManifestEntry {
  return {
    key: "k",
    label: "Label",
    ...overrides,
  };
}

// Stateful wrapper so controlled-input tests behave like a real form —
// onChange calls flow back through to the component's `value` prop.
function StatefulField({
  fieldDef,
  initial,
  onChangeSpy,
}: {
  fieldDef: MetaBoxFieldManifestEntry;
  initial: unknown;
  onChangeSpy: (next: unknown) => void;
}): ReactNode {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <MetaBoxField
      field={fieldDef}
      value={value}
      onChange={(next) => {
        onChangeSpy(next);
        setValue(next);
      }}
    />
  );
}

describe("MetaBoxField dispatcher", () => {
  test("text: renders an <input type=text>, forwards value + onChange", async () => {
    const onChange = vi.fn();
    render(
      <MetaBoxField
        field={field({ inputType: "text", placeholder: "Type here" })}
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("placeholder", "Type here");

    await userEvent.type(input, "ab");
    expect(onChange).toHaveBeenCalledWith("a");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  test("textarea: renders a <textarea>, honours maxLength + rows", () => {
    render(
      <MetaBoxField
        field={field({ inputType: "textarea", maxLength: 50 })}
        value="existing"
        onChange={vi.fn()}
      />,
    );
    const el = screen.getByTestId("meta-box-field-k-input");
    expect(el.tagName).toBe("TEXTAREA");
    expect(el).toHaveAttribute("maxLength", "50");
    expect(el).toHaveValue("existing");
  });

  test("number: coerces empty string to null, numeric to Number", async () => {
    const onChange = vi.fn();
    render(
      <StatefulField
        fieldDef={field({ inputType: "number", min: 0, max: 100 })}
        initial={42}
        onChangeSpy={onChange}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "100");

    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);

    await userEvent.type(input, "7");
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  test("number: partial input like '-' does not propagate NaN", async () => {
    const onChange = vi.fn();
    render(
      <StatefulField
        fieldDef={field({ inputType: "number" })}
        initial={null}
        onChangeSpy={onChange}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    // Typing "-" on an empty number input is valid partial state in most
    // browsers but Number("-") is NaN; the component must drop it on the
    // floor so NaN never lands in form state.
    await userEvent.type(input, "-");
    for (const call of onChange.mock.calls) {
      expect(Number.isNaN(call[0])).toBe(false);
    }
  });

  test("email / url: emit the matching native HTML5 input type", () => {
    const { rerender } = render(
      <MetaBoxField
        field={field({ inputType: "email" })}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("meta-box-field-k-input")).toHaveAttribute(
      "type",
      "email",
    );

    rerender(
      <MetaBoxField
        field={field({ inputType: "url" })}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("meta-box-field-k-input")).toHaveAttribute(
      "type",
      "url",
    );
  });

  test("select: renders settings, selection fires onChange with the value", async () => {
    const onChange = vi.fn();
    render(
      <MetaBoxField
        field={field({
          inputType: "select",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Bravo" },
          ],
        })}
        value="a"
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId("meta-box-field-k-input");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveValue("a");

    await userEvent.selectOptions(select, "b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  test("radio: renders one input per option, click fires onChange", async () => {
    const onChange = vi.fn();
    render(
      <MetaBoxField
        field={field({
          inputType: "radio",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Bravo" },
          ],
        })}
        value="a"
        onChange={onChange}
      />,
    );
    const bravo = screen.getByTestId("meta-box-field-k-input-b");
    expect(bravo).toHaveAttribute("type", "radio");

    await userEvent.click(bravo);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  test("checkbox: renders as inline label, toggles emit the checked boolean", async () => {
    const onChange = vi.fn();
    render(
      <MetaBoxField
        field={field({ inputType: "checkbox", label: "Featured" })}
        value={false}
        onChange={onChange}
      />,
    );
    const box = screen.getByTestId("meta-box-field-k-input");
    expect(box).toHaveAttribute("type", "checkbox");

    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("unknown inputType: falls back to text input + logs a dev warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      // silence expected warning
    });
    render(
      <MetaBoxField
        field={field({ inputType: "mystery" })}
        value=""
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(warn).toHaveBeenCalledOnce();
    const firstCall = warn.mock.calls[0];
    expect(firstCall?.[0]).toContain("unknown meta-box field inputType");
  });

  test("description renders under the field and is referenced by aria-describedby", () => {
    render(
      <MetaBoxField
        field={field({
          inputType: "text",
          description: "Help text",
        })}
        value=""
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const desc = screen.getByTestId("meta-box-field-k-description");
    expect(desc).toHaveAttribute("id", describedBy);
    expect(desc).toHaveTextContent("Help text");
  });

  test("required flag propagates to the native input", () => {
    render(
      <MetaBoxField
        field={field({ inputType: "text", required: true })}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("meta-box-field-k-input")).toBeRequired();
  });
});
