import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockAttributeSchema } from "@plumix/blocks";

import { InspectorField } from "./InspectorField.js";

afterEach(() => {
  cleanup();
});

describe("InspectorField — select", () => {
  const selectAttr: BlockAttributeSchema = {
    type: "select",
    label: "Heading level",
    default: 2,
    options: [
      { value: 1, label: "H1" },
      { value: 2, label: "H2" },
      { value: 3, label: "H3" },
    ],
  };

  test("renders a select with one option per entry, reflecting the current value", () => {
    render(
      <InspectorField
        name="level"
        schema={selectAttr}
        value={2}
        onChange={vi.fn()}
      />,
    );
    const field = document.querySelector<HTMLSelectElement>(
      '[data-testid="inspector-field-level"]',
    );
    if (!field) throw new Error("inspector-field-level not rendered");
    expect(field.tagName).toBe("SELECT");
    expect(field.value).toBe("2");
    expect(field.querySelectorAll("option")).toHaveLength(3);
  });

  test("changing the select fires onChange with the coerced value", () => {
    const onChange = vi.fn();
    render(
      <InspectorField
        name="level"
        schema={selectAttr}
        value={2}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("inspector-field-level"), {
      target: { value: "3" },
    });
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

describe("InspectorField — boolean", () => {
  const boolAttr: BlockAttributeSchema = {
    type: "boolean",
    label: "Numbered",
    default: false,
  };

  test("renders a checkbox reflecting the current value", () => {
    render(
      <InspectorField
        name="numbered"
        schema={boolAttr}
        value={true}
        onChange={vi.fn()}
      />,
    );
    const field = document.querySelector<HTMLInputElement>(
      '[data-testid="inspector-field-numbered"]',
    );
    if (!field) throw new Error("inspector-field-numbered not rendered");
    expect(field.type).toBe("checkbox");
    expect(field.checked).toBe(true);
  });

  test("toggling the checkbox fires onChange with the new boolean", () => {
    const onChange = vi.fn();
    render(
      <InspectorField
        name="numbered"
        schema={boolAttr}
        value={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("inspector-field-numbered"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("InspectorField — link", () => {
  const linkAttr: BlockAttributeSchema = {
    type: "link",
    label: "Destination",
    default: "",
  };

  test("renders a url input reflecting the current value", () => {
    render(
      <InspectorField
        name="href"
        schema={linkAttr}
        value="https://example.com"
        onChange={vi.fn()}
      />,
    );
    const field = document.querySelector<HTMLInputElement>(
      '[data-testid="inspector-field-href"]',
    );
    if (!field) throw new Error("inspector-field-href not rendered");
    expect(field.type).toBe("url");
    expect(field.value).toBe("https://example.com");
  });

  test("typing in the url input fires onChange with the string value", () => {
    const onChange = vi.fn();
    render(
      <InspectorField
        name="href"
        schema={linkAttr}
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("inspector-field-href"), {
      target: { value: "https://x.example" },
    });
    expect(onChange).toHaveBeenCalledWith("https://x.example");
  });
});

describe("InspectorField — unknown type", () => {
  test("renders nothing for an unsupported schema.type (no crash)", () => {
    const { container } = render(
      <InspectorField
        name="exotic"
        schema={{ type: "color-wheel-3d" }}
        value="unused"
        onChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
