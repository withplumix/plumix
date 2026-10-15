import { describe, expect, test } from "vitest";

import {
  decodeKeyword,
  encodeKeyword,
  formatBackgroundImageUrl,
  formatTextShadow,
  inheritedStyleValue,
  parseBackgroundImageUrl,
  parseTextShadow,
  tagNameChoice,
  toggleTextMark,
} from "./styles-tab-model.js";

describe("inheritedStyleValue", () => {
  test("an unset value on a narrower device inherits the desktop value", () => {
    expect(
      inheritedStyleValue({ large: { width: "50%" } }, "small", "width"),
    ).toBe("50%");
  });

  test("the nearest wider device's value wins", () => {
    expect(
      inheritedStyleValue(
        { large: { width: "50%" }, medium: { width: "30%" } },
        "small",
        "width",
      ),
    ).toBe("30%");
  });

  test("desktop inherits nothing", () => {
    expect(
      inheritedStyleValue({ large: { width: "50%" } }, "large", "width"),
    ).toBeUndefined();
  });
});

describe("background image url", () => {
  test("composes a url() from a bare URL", () => {
    expect(formatBackgroundImageUrl("https://ex.com/a.png")).toBe(
      'url("https://ex.com/a.png")',
    );
  });

  test("a cleared URL removes the property", () => {
    expect(formatBackgroundImageUrl("  ")).toBeNull();
  });

  test("reads the bare URL back out of a stored url()", () => {
    expect(parseBackgroundImageUrl('url("https://ex.com/a.png")')).toBe(
      "https://ex.com/a.png",
    );
  });

  test("a value that isn't a url() reads as empty", () => {
    expect(parseBackgroundImageUrl("linear-gradient(red, blue)")).toBe("");
  });
});

describe("text shadow", () => {
  test("composes x, y and blur as px lengths before the color", () => {
    expect(
      formatTextShadow({ x: "1", y: "2", blur: "5", color: "#ff0000" }),
    ).toBe("1px 2px 5px #ff0000");
  });

  test("an emptied length composes as 0, never a malformed px", () => {
    expect(
      formatTextShadow({ x: "", y: "1", blur: "3", color: "#000000" }),
    ).toBe("0px 1px 3px #000000");
  });

  test("reads a stored text-shadow back into its parts", () => {
    expect(parseTextShadow("2px 4px 6px #123456")).toEqual({
      x: "2",
      y: "4",
      blur: "6",
      color: "#123456",
    });
  });

  test("an unset text-shadow reads as the soft default", () => {
    expect(parseTextShadow(undefined)).toEqual({
      x: "1",
      y: "1",
      blur: "3",
      color: "#000000",
    });
  });
});

describe("toggleTextMark", () => {
  test("pressing italic writes a fontStyle", () => {
    expect(toggleTextMark(() => undefined, ["italic"])).toEqual([
      { property: "fontStyle", value: "italic" },
    ]);
  });

  test("strikethrough replaces underline on the shared textDecoration", () => {
    const stored: Record<string, string> = { textDecoration: "underline" };

    // Radix hands back the whole pressed set, underline still in it.
    expect(
      toggleTextMark(
        (property) => stored[property],
        ["underline", "strikethrough"],
      ),
    ).toEqual([{ property: "textDecoration", value: "line-through" }]);
  });

  test("unpressing a mark clears its property", () => {
    const stored: Record<string, string> = { fontWeight: "bold" };

    expect(toggleTextMark((property) => stored[property], [])).toEqual([
      { property: "fontWeight", value: null },
    ]);
  });
});

describe("keyword select", () => {
  test("the none keyword is a value, kept distinct from clearing", () => {
    expect(decodeKeyword(encodeKeyword("none"))).toBe("none");
  });

  test("the clear choice removes the property", () => {
    expect(decodeKeyword(encodeKeyword(undefined))).toBeNull();
  });
});

describe("tagNameChoice", () => {
  test("an allowlisted tag name is chosen as stored", () => {
    expect(tagNameChoice("section")).toBe("section");
  });

  test("a tag name outside the allowlist presents as Default, matching render", () => {
    expect(tagNameChoice("script")).toBe(tagNameChoice(undefined));
  });
});
