import { describe, expect, test } from "vitest";

import type { BlockInputOption } from "@plumix/core/blocks";

import {
  comboboxCreatable,
  comboboxItems,
  decodeOption,
  decodeSelectKey,
  encodeSelectKey,
  parseNumberInput,
} from "./block-input-options.js";

describe("select keys", () => {
  test.each<[string, readonly BlockInputOption[], BlockInputOption["value"]]>([
    [
      "a numeric",
      [
        { label: "H2", value: 2 },
        { label: "H3", value: 3 },
      ],
      3,
    ],
    [
      "a boolean",
      [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
      true,
    ],
    [
      "an empty-string",
      [
        { label: "Default", value: "" },
        { label: "Wide", value: "wide" },
      ],
      "",
    ],
  ])("%s option value round-trips through its key", (_, options, value) => {
    const key = encodeSelectKey(value);

    expect(decodeOption(options, decodeSelectKey(key))).toBe(value);
  });

  test("an empty-string option gets a key Radix accepts", () => {
    expect(encodeSelectKey("")).not.toBe("");
  });

  test("an unset value keys as Radix's empty value, so the trigger shows its placeholder", () => {
    expect(encodeSelectKey(undefined)).toBe("");
  });

  test("a key no option matches decodes as itself", () => {
    expect(decodeOption([{ label: "Tablet", value: "tablet" }], "mobile")).toBe(
      "mobile",
    );
  });
});

describe("parseNumberInput", () => {
  test("reads a number", () => {
    expect(parseNumberInput("3")).toBe(3);
  });

  test.each([
    ["cleared", ""],
    ["a lone minus mid-typing", "-"],
    ["unparseable", "e"],
    ["too large for a number", "1e999"],
  ])("clears to null when %s, never NaN or Infinity", (_, text) => {
    expect(parseNumberInput(text)).toBeNull();
  });
});

describe("comboboxItems", () => {
  test("a search matches an option's label, not just its value", () => {
    // The control resolves each label through Lingui; here it reads as-is.
    const [item] = comboboxItems([{ label: "C++", value: "cpp" }], () => "C++");

    expect(item).toMatchObject({ value: "cpp", keywords: ["C++"] });
  });
});

describe("comboboxCreatable", () => {
  test("offers a free-typed value not in the options, trimmed", () => {
    expect(
      comboboxCreatable("  custom ", [{ label: "News", value: "news" }]),
    ).toBe("custom");
  });

  test("offers nothing when the query is an option's value", () => {
    expect(
      comboboxCreatable("news", [{ label: "News", value: "news" }]),
    ).toBeNull();
  });

  test("offers nothing for a blank query", () => {
    expect(comboboxCreatable("  ", [])).toBeNull();
  });
});
