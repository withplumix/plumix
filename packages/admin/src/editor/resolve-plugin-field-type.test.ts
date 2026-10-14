import type { ComponentProps, ReactElement } from "react";
import {
  _resetPluginRegistry,
  registerPluginFieldType,
} from "@/lib/plugin-registry.js";
import { afterEach, describe, expect, test } from "vitest";

import {
  blockInputToField,
  resolvePluginFieldType,
} from "./resolve-plugin-field-type.js";

type PluginFieldProps = ComponentProps<
  Parameters<typeof registerPluginFieldType>[1]
>;

afterEach(() => {
  _resetPluginRegistry();
});

describe("resolvePluginFieldType", () => {
  test("an unregistered type resolves to nothing", () => {
    expect(resolvePluginFieldType("nope")).toBeUndefined();
  });

  test("hands the plugin control the block attr's rhf onChange, so its edits reach the attr", () => {
    registerPluginFieldType("media", () => null);
    const Control = resolvePluginFieldType("media");
    const onChange = (): void => undefined;

    const element = Control?.({
      field: { name: "image", type: "media" },
      rhf: { value: null, onChange, onBlur: () => undefined, name: "image" },
      disabled: false,
      testId: "block-input-image",
    }) as ReactElement<PluginFieldProps>;

    expect(element.props.rhf.onChange).toBe(onChange);
  });
});

describe("blockInputToField", () => {
  test("carries a block input's accept into the reference scope the picker filters by", () => {
    expect(
      blockInputToField({ name: "image", type: "media", accept: "image/" }),
    ).toEqual({
      key: "image",
      label: "image",
      type: "json",
      inputType: "media",
      referenceTarget: { kind: "media", scope: { accept: "image/" } },
    });
  });
});
