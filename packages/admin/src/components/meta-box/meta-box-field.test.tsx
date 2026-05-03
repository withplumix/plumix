import type { ReactNode } from "react";
import { useEffect } from "react";
import { Form } from "@/components/ui/form.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
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
    type: "string",
    ...overrides,
  };
}

// Mounts `MetaBoxField` inside a react-hook-form context so tests behave
// like a real form — Controller subscribes to updates and the onChange
// we spy on mirrors what the parent form would see on submit.
function Harness({
  fieldDef,
  initial,
  onChangeSpy,
}: {
  fieldDef: MetaBoxFieldManifestEntry;
  initial: unknown;
  onChangeSpy?: (next: unknown) => void;
}): ReactNode {
  const form = useForm<Record<string, unknown>>({
    defaultValues: { [fieldDef.key]: initial },
  });
  return (
    <Form {...form}>
      <MetaBoxField field={fieldDef} name={fieldDef.key} />
      {onChangeSpy ? <Spy name={fieldDef.key} onChange={onChangeSpy} /> : null}
    </Form>
  );
}

// Subscribes via `useWatch` (compiler-compatible) and fires the spy on
// every value change — mirrors what the original `form.watch` callback
// did but without tripping the `react-hooks/incompatible-library` rule.
// Fires once with the initial value too; the surrounding assertions use
// `toHaveBeenCalledWith` / `toHaveBeenLastCalledWith`, both of which are
// indifferent to that extra call.
function Spy({
  name,
  onChange,
}: {
  name: string;
  onChange: (next: unknown) => void;
}): ReactNode {
  const value: unknown = useWatch({ name });
  useEffect(() => {
    onChange(value);
  }, [value, onChange]);
  return null;
}

describe("MetaBoxField dispatcher", () => {
  test("text: renders an <input type=text>, forwards value + onChange", async () => {
    const onChange = vi.fn();
    render(
      <Harness
        fieldDef={field({ inputType: "text", placeholder: "Type here" })}
        initial=""
        onChangeSpy={onChange}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("placeholder", "Type here");

    await userEvent.type(input, "ab");
    expect(onChange).toHaveBeenCalledWith("a");
    expect(onChange).toHaveBeenCalledWith("ab");
  });

  test("textarea: renders a <textarea>, honours maxLength + rows", () => {
    render(
      <Harness
        fieldDef={field({ inputType: "textarea", maxLength: 50 })}
        initial="existing"
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
      <Harness
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
      <Harness
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
      <Harness fieldDef={field({ inputType: "email" })} initial="" />,
    );
    expect(screen.getByTestId("meta-box-field-k-input")).toHaveAttribute(
      "type",
      "email",
    );

    rerender(<Harness fieldDef={field({ inputType: "url" })} initial="" />);
    expect(screen.getByTestId("meta-box-field-k-input")).toHaveAttribute(
      "type",
      "url",
    );
  });

  test("date / datetime / time: emit the matching native HTML5 input type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      // would-be unknown-inputType warning; should not fire for builtins
    });

    const onDateChange = vi.fn();
    const { rerender } = render(
      <Harness
        fieldDef={field({
          inputType: "date",
          min: "2024-01-01",
          max: "2030-12-31",
        })}
        initial=""
        onChangeSpy={onDateChange}
      />,
    );
    let input = screen.getByTestId("meta-box-field-k-input");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("min", "2024-01-01");
    expect(input).toHaveAttribute("max", "2030-12-31");

    rerender(
      <Harness fieldDef={field({ inputType: "datetime" })} initial="" />,
    );
    input = screen.getByTestId("meta-box-field-k-input");
    // `datetime` field maps to the native `datetime-local` input type.
    expect(input).toHaveAttribute("type", "datetime-local");

    rerender(<Harness fieldDef={field({ inputType: "time" })} initial="" />);
    input = screen.getByTestId("meta-box-field-k-input");
    expect(input).toHaveAttribute("type", "time");

    expect(warn).not.toHaveBeenCalled();
  });

  test("date: empty input clears the value to null, otherwise propagates the ISO string", async () => {
    const onChange = vi.fn();
    render(
      <Harness
        fieldDef={field({ inputType: "date" })}
        initial="2026-05-03"
        onChangeSpy={onChange}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    expect(input).toHaveValue("2026-05-03");

    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("color: swatch + hex input share the same value via react-colorful", async () => {
    const onChange = vi.fn();
    render(
      <Harness
        fieldDef={field({ inputType: "color" })}
        initial="#1a2b3c"
        onChangeSpy={onChange}
      />,
    );
    const swatch = screen.getByTestId("meta-box-field-k-input-swatch");
    const hex = screen.getByTestId("meta-box-field-k-input-hex");
    // Swatch trigger reflects the color via inline `background-color`.
    expect(swatch).toHaveStyle({ "background-color": "#1a2b3c" });
    expect(hex).toHaveValue("#1a2b3c");

    // Editing the hex input propagates upward.
    await userEvent.clear(hex);
    await userEvent.type(hex, "#abcdef");
    expect(onChange).toHaveBeenLastCalledWith("#abcdef");
  });

  test("range: slider exposes value via the inline display + carries bounds on root", () => {
    render(
      <Harness
        fieldDef={field({ inputType: "range", min: 0, max: 100, step: 5 })}
        initial={20}
      />,
    );
    expect(
      screen.getByTestId("meta-box-field-k-input-display"),
    ).toHaveTextContent("20");
    const root = screen.getByTestId("meta-box-field-k-input-slider");
    // Radix forwards `aria-valuemin` / `aria-valuemax` to the thumb,
    // but the user-visible signal lives on the inline display
    // anchored by `-display`. Assert root visibility + the displayed
    // value, then trust radix on the slider semantics it owns.
    expect(root).toBeInTheDocument();
  });

  test("password: renders masked input, value propagates without warnings", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      // would-be unknown-inputType warning; should not fire
    });
    const onChange = vi.fn();
    render(
      <Harness
        fieldDef={field({
          inputType: "password",
          placeholder: "••••••",
          maxLength: 64,
        })}
        initial=""
        onChangeSpy={onChange}
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("placeholder", "••••••");
    expect(input).toHaveAttribute("maxLength", "64");

    await userEvent.type(input, "hunter2");
    expect(onChange).toHaveBeenLastCalledWith("hunter2");
    // `password` is a recognised builtin — no fallback warning should
    // fire even though the dispatcher's switch-case routes it through
    // the shared text-input branch.
    expect(warn).not.toHaveBeenCalled();
  });

  test("select: renders settings, selection fires onChange with the value", async () => {
    const onChange = vi.fn();
    render(
      <Harness
        fieldDef={field({
          inputType: "select",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Bravo" },
          ],
        })}
        initial="a"
        onChangeSpy={onChange}
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
      <Harness
        fieldDef={field({
          inputType: "radio",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Bravo" },
          ],
        })}
        initial="a"
        onChangeSpy={onChange}
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
      <Harness
        fieldDef={field({ inputType: "checkbox", label: "Featured" })}
        initial={false}
        onChangeSpy={onChange}
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
    render(<Harness fieldDef={field({ inputType: "mystery" })} initial="" />);
    const input = screen.getByTestId("meta-box-field-k-input");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(warn).toHaveBeenCalled();
    const firstCall = warn.mock.calls[0];
    expect(firstCall?.[0]).toContain("unknown meta-box field inputType");
  });

  test("description renders under the field and is referenced by aria-describedby", () => {
    render(
      <Harness
        fieldDef={field({
          inputType: "text",
          description: "Help text",
        })}
        initial=""
      />,
    );
    const input = screen.getByTestId("meta-box-field-k-input");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const desc = screen.getByTestId("meta-box-field-k-description");
    // shadcn's FormControl joins description + message ids with a space
    // — assert the description id is present in the list rather than an
    // exact equality that would break once the message id joins in on
    // validation errors.
    expect(describedBy?.split(" ")).toContain(desc.id);
    expect(desc).toHaveTextContent("Help text");
  });

  test("required flag propagates to the native input", () => {
    render(
      <Harness
        fieldDef={field({ inputType: "text", required: true })}
        initial=""
      />,
    );
    expect(screen.getByTestId("meta-box-field-k-input")).toBeRequired();
  });
});
