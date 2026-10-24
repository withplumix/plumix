import { describe, expect, test } from "vitest";

import {
  allowsCustomStyles,
  forbiddenStyles,
  refusesStyleValue,
} from "./style-policy.js";

const tokens = { color: { primary: { value: "#06f" } } };

describe("allowsCustomStyles", () => {
  test.each([
    ["a token category", "color"],
    ["a property's own category", "width"],
    ["a custom property", "--brand"],
  ])(
    "allows custom values in %s when the theme says nothing",
    (_, category) => {
      expect(
        allowsCustomStyles({ allowCustomStyles: true, tokens }, category),
      ).toBe(true);
    },
  );

  test.each([
    ["a token category", "color"],
    ["a property's own category", "width"],
    ["a custom property", "--brand"],
  ])("refuses custom values in %s under tokens only", (_, category) => {
    expect(
      allowsCustomStyles({ allowCustomStyles: false, tokens }, category),
    ).toBe(false);
  });

  test.each([
    ["width", true],
    ["height", true],
    ["color", false],
    ["spacing", false],
    ["opacity", false],
  ])(
    "with [width, height], %s accepts custom values: %s",
    (category, allowed) => {
      expect(
        allowsCustomStyles(
          { allowCustomStyles: ["width", "height"], tokens },
          category,
        ),
      ).toBe(allowed);
    },
  );

  test.each([
    [true, true],
    [false, false],
    [["width", "height"], false],
  ] as const)(
    "with no category, answers for raw CSS and class names: %j → %s",
    (allowCustomStyles, allowed) => {
      expect(allowsCustomStyles({ allowCustomStyles, tokens })).toBe(allowed);
    },
  );
});

describe("refusesStyleValue", () => {
  const tokensOnly = {
    allowCustomStyles: false,
    tokens: {
      color: { primary: { value: "#06f" }, plumix: { value: "#111" } },
      spacing: { md: { value: "1rem" } },
      fontFamily: { sans: { value: "Inter" } },
    },
  } as const;

  test.each([
    ["color", "#e11"],
    ["paddingTop", "13px"],
    ["width", "10px"],
    ["color", "var(--plumix-color-gone, #e11)"],
    ["color", "var(--plumix-spacing-md, 1rem)"],
    ["color", "var(--plumix-color-primary) #e11"],
    ["color", "var(--plumix-color-primary, x) url(evil.png)"],
    ["fontFamily", 'var(--plumix-font-family-sans, x "(" ), Comic Sans, ")'],
    ["color", "var(--plumix-color-primary, x '(') url(evil.png) ')"],
    ["__proto__", "var(--plumix-__proto__-toString)"],
    ["fontWeight", "900"],
    ["--brand", "red"],
  ])("refuses %s: %s under tokens only", (property, value) => {
    expect(refusesStyleValue(tokensOnly, property, value)).toBe(true);
  });

  test.each([
    ["color", "var(--plumix-color-primary, #06f)"],
    ["color", "var(--plumix-color-primary)"],
    ["color", "var(--plumix-color-plumix)"],
    ["color", "var(--plumix-color-primary, rgb(0 102 255))"],
    ["fontFamily", 'var(--plumix-font-family-sans, "Fira (Code)", serif)'],
    ["marginTop", "var(--plumix-spacing-md, 1rem)"],
    ["borderStyle", "dashed"],
    ["display", "flex"],
    ["justifyContent", "space-between"],
    ["alignSelf", "stretch"],
    ["textAlign", "center"],
    ["fontWeight", "bold"],
    ["fontStyle", "italic"],
    ["textDecoration", "line-through"],
  ])("accepts %s: %s under tokens only", (property, value) => {
    expect(refusesStyleValue(tokensOnly, property, value)).toBe(false);
  });

  test("accepts a literal in a category the theme leaves custom", () => {
    expect(
      refusesStyleValue(
        { ...tokensOnly, allowCustomStyles: ["width"] },
        "width",
        "10px",
      ),
    ).toBe(false);
  });

  test("accepts any literal when the theme allows custom values", () => {
    expect(
      refusesStyleValue(
        { ...tokensOnly, allowCustomStyles: true },
        "color",
        "#e11",
      ),
    ).toBe(false);
  });
});

describe("forbiddenStyles", () => {
  const tokensOnly = {
    allowCustomStyles: false,
    tokens: { color: { primary: { value: "#06f" } } },
  } as const;

  test("lists each refused value with its breakpoint and property", () => {
    const node = {
      id: "a",
      name: "core/text",
      style: {
        large: { color: "#e11", borderStyle: "solid" },
        small: {
          background: "var(--plumix-color-primary, #06f)",
          width: "9px",
        },
      },
    };

    expect(forbiddenStyles(node, tokensOnly, undefined)).toEqual([
      { kind: "style", bucket: "large", property: "color", value: "#e11" },
      { kind: "style", bucket: "small", property: "width", value: "9px" },
    ]);
  });

  test("passes a value equal to the block's defaultStyles at that breakpoint", () => {
    const node = {
      id: "a",
      name: "core/text",
      style: { large: { padding: "12px" }, small: { padding: "12px" } },
    };
    const spec = { defaultStyles: { large: { padding: "12px" } } };

    expect(forbiddenStyles(node, tokensOnly, spec)).toEqual([
      { kind: "style", bucket: "small", property: "padding", value: "12px" },
    ]);
  });

  test("lists a class name while any category is tokens only", () => {
    const node = { id: "a", name: "core/text", className: "brand-red" };

    expect(
      forbiddenStyles(
        node,
        { ...tokensOnly, allowCustomStyles: ["width"] },
        undefined,
      ),
    ).toEqual([{ kind: "className", value: "brand-red" }]);
  });

  test("lists nothing when the theme allows custom values", () => {
    const node = {
      id: "a",
      name: "core/text",
      className: "brand-red",
      style: { large: { color: "#e11" } },
    };

    expect(
      forbiddenStyles(
        node,
        { ...tokensOnly, allowCustomStyles: true },
        undefined,
      ),
    ).toEqual([]);
  });
});
