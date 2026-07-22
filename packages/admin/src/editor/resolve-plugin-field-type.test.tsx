import {
  _resetPluginRegistry,
  registerPluginFieldType,
} from "@/lib/plugin-registry.js";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockInput } from "@plumix/blocks";

import { resolvePluginFieldType } from "./resolve-plugin-field-type.js";

afterEach(() => {
  cleanup();
  _resetPluginRegistry();
});

describe("resolvePluginFieldType", () => {
  test("returns undefined for an unregistered type", () => {
    expect(resolvePluginFieldType("nope")).toBeUndefined();
  });

  test("adapts the block input onto the field manifest the plugin control reads", () => {
    const seen = vi.fn();
    registerPluginFieldType("media", ({ field, testId }) => {
      seen(field);
      return <div data-testid={testId} />;
    });

    const Control = resolvePluginFieldType("media");
    expect(Control).toBeDefined();

    const input: BlockInput = {
      name: "image",
      type: "media",
      accept: "image/",
    };
    if (!Control) throw new Error("expected a control");
    const { getByTestId } = render(
      <Control
        field={input}
        rhf={{ value: null, onChange: vi.fn(), onBlur: vi.fn(), name: "image" }}
        disabled={false}
        testId="block-input-image"
      />,
    );

    expect(getByTestId("block-input-image")).toBeDefined();
    // The reference scope (accept) rides through so the picker filters to images.
    const field = seen.mock.calls[0]?.[0];
    expect(field.inputType).toBe("media");
    expect(field.referenceTarget?.scope?.accept).toBe("image/");
  });

  test("forwards the rhf binding so edits reach the block attr", () => {
    const onChange = vi.fn();
    registerPluginFieldType("media", ({ rhf, testId }) => (
      <button data-testid={testId} onClick={() => rhf.onChange({ id: "9" })} />
    ));
    const Control = resolvePluginFieldType("media");
    const input: BlockInput = { name: "image", type: "media" };
    if (!Control) throw new Error("expected a control");
    const { getByTestId } = render(
      <Control
        field={input}
        rhf={{ value: null, onChange, onBlur: vi.fn(), name: "image" }}
        disabled={false}
        testId="block-input-image"
      />,
    );
    getByTestId("block-input-image").click();
    expect(onChange).toHaveBeenCalledWith({ id: "9" });
  });
});
