import { describe, expect, test } from "vitest";

import type { BlockNode, StylePolicy } from "@plumix/core/blocks";

import { stylePolicyView } from "./style-policy-view.js";

const tokensOnly: StylePolicy = {
  allowCustomStyles: false,
  tokens: { color: { primary: { value: "#06f" } } },
};

const block: BlockNode = {
  id: "a",
  name: "core/section",
  className: "brand",
  style: {
    large: { color: "#e11", paddingTop: "3rem", transform: "rotate(3deg)" },
    small: { width: "9px" },
  },
};
const spec = { defaultStyles: { large: { paddingTop: "3rem" } } };

describe("stylePolicyView", () => {
  test.each([
    ["color", false],
    ["width", true],
    ["paddingTop", false],
  ])(
    "asks the policy whether %s accepts custom values",
    (property, allowed) => {
      const view = stylePolicyView(
        { ...tokensOnly, allowCustomStyles: ["width"] },
        block,
        spec,
        "large",
      );

      expect(view.allowsCustom(property)).toBe(allowed);
    },
  );

  test("lists the stored values refused at the device's breakpoint", () => {
    const view = stylePolicyView(tokensOnly, block, spec, "large");

    expect(view.refused).toEqual([
      { property: "color", value: "#e11" },
      { property: "transform", value: "rotate(3deg)" },
    ]);
  });

  test("names a stored class name and closes raw CSS under tokens only", () => {
    const view = stylePolicyView(tokensOnly, block, spec, "large");

    expect(view.allowsRawCss).toBe(false);
    expect(view.forbiddenClassName).toBe("brand");
  });

  test("allows everything when the theme allows custom values", () => {
    const view = stylePolicyView(
      { ...tokensOnly, allowCustomStyles: true },
      block,
      spec,
      "small",
    );

    expect(view.allowsCustom("width")).toBe(true);
    expect(view.allowsRawCss).toBe(true);
    expect(view.refused).toEqual([]);
    expect(view.forbiddenClassName).toBeUndefined();
  });
});
