import type { BlockInput } from "@plumix/blocks";
import { describe, expect, test } from "vitest";

import { translateField, translateFields } from "./field-type-translator.js";

describe("translateField", () => {
  test("identity-maps native Puck types: text, textarea, number", () => {
    expect(translateField({ name: "x", type: "text" })).toEqual({
      type: "text",
      label: undefined,
    });
    expect(translateField({ name: "x", type: "textarea" })).toEqual({
      type: "textarea",
      label: undefined,
    });
    expect(translateField({ name: "x", type: "number" })).toEqual({
      type: "number",
      label: undefined,
    });
  });

  test("translates select with options", () => {
    const input: BlockInput = {
      name: "level",
      type: "select",
      label: "Level",
      options: [
        { label: "H1", value: 1 },
        { label: "H2", value: 2 },
      ],
    };

    expect(translateField(input)).toEqual({
      type: "select",
      label: "Level",
      options: [
        { label: "H1", value: 1 },
        { label: "H2", value: 2 },
      ],
    });
  });

  test("maps slot to Puck's slot field type", () => {
    expect(translateField({ name: "content", type: "slot", label: "Body" })).toEqual({
      type: "slot",
      label: "Body",
    });
  });

  test("falls back to text for unknown field types", () => {
    expect(
      translateField({ name: "x", type: "wat", label: "Unknown" }),
    ).toEqual({ type: "text", label: "Unknown" });
  });
});

describe("translateFields", () => {
  test("maps an array of inputs to a Puck fields record keyed by name", () => {
    const inputs: readonly BlockInput[] = [
      { name: "text", type: "text" },
      { name: "level", type: "number" },
    ];

    const fields = translateFields(inputs);

    expect(Object.keys(fields)).toEqual(["text", "level"]);
    expect(fields.text).toEqual({ type: "text", label: undefined });
    expect(fields.level).toEqual({ type: "number", label: undefined });
  });
});
