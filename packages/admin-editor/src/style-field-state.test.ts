import { describe, expect, test } from "vitest";

import type { StyleField } from "@plumix/core/blocks";
import { createStyleFields } from "@plumix/core/blocks";

import type { StyleFieldStateOptions } from "./style-field-state.js";
import { styleFieldState } from "./style-field-state.js";

const fields = createStyleFields({
  color: { primary: { value: "#0c2238", label: "Primary" } },
  spacing: { sm: { value: "8px" }, lg: { value: "24px", label: "Large" } },
});

const padding: StyleField = fields.field("padding");
const display: StyleField = fields.field("display");
const fontSize: StyleField = fields.field("fontSize");

function options(
  overrides: Partial<StyleFieldStateOptions> = {},
): StyleFieldStateOptions {
  return {
    onChange: () => undefined,
    onPreferredModeChange: () => undefined,
    ...overrides,
  };
}

describe("styleFieldState — mode derivation", () => {
  test("a token value drives token mode", () => {
    const state = styleFieldState(
      padding,
      "var(--plumix-spacing-lg, 24px)",
      undefined,
      options(),
    );

    expect(state).toMatchObject({ mode: "token", tokenId: "lg" });
  });

  test("a literal value drives custom mode", () => {
    const state = styleFieldState(padding, "20px", "token", options());

    expect(state).toMatchObject({ mode: "custom", literalText: "20px" });
  });

  test("with no value, mode defaults to token when the field has tokens", () => {
    const state = styleFieldState(padding, undefined, undefined, options());

    expect(state.mode).toBe("token");
  });

  test("with no value, mode follows the author's last toggle", () => {
    const state = styleFieldState(padding, undefined, "custom", options());

    expect(state.mode).toBe("custom");
  });

  test("with no value, a scale the theme declares no tokens for starts in custom mode", () => {
    const state = styleFieldState(fontSize, undefined, undefined, options());

    expect(state).toMatchObject({ category: "fontSize", mode: "custom" });
  });

  test("with no value and no token scale, mode is custom", () => {
    const state = styleFieldState(display, undefined, "token", options());

    expect(state).toMatchObject({ hasTokens: false, mode: "custom" });
  });
});

describe("styleFieldState — literalOnly", () => {
  test("offers no tokens and shows a stored token var() as raw text", () => {
    const state = styleFieldState(
      padding,
      "var(--plumix-spacing-lg, 24px)",
      undefined,
      options({ literalOnly: true }),
    );

    expect({
      hasTokens: state.hasTokens,
      options: state.options,
      mode: state.mode,
      tokenId: state.tokenId,
      literalText: state.literalText,
    }).toEqual({
      hasTokens: false,
      options: [],
      mode: "custom",
      tokenId: null,
      literalText: "var(--plumix-spacing-lg, 24px)",
    });
  });
});

describe("styleFieldState — setMode", () => {
  test("switching a token value to custom clears it", () => {
    const writes: (string | null)[] = [];
    const state = styleFieldState(
      padding,
      "var(--plumix-spacing-lg, 24px)",
      undefined,
      options({ onChange: (value) => writes.push(value) }),
    );

    state.setMode("custom");

    expect(writes).toEqual([null]);
  });

  test("switching a literal value to token clears it", () => {
    const writes: (string | null)[] = [];
    const state = styleFieldState(
      padding,
      "20px",
      undefined,
      options({ onChange: (value) => writes.push(value) }),
    );

    state.setMode("token");

    expect(writes).toEqual([null]);
  });

  test("switching modes with no value writes nothing", () => {
    const writes: (string | null)[] = [];
    const state = styleFieldState(
      padding,
      undefined,
      undefined,
      options({ onChange: (value) => writes.push(value) }),
    );

    state.setMode("custom");

    expect(writes).toEqual([]);
  });

  test("records the toggle as the author's preferred mode", () => {
    const preferred: string[] = [];
    const state = styleFieldState(
      padding,
      undefined,
      undefined,
      options({ onPreferredModeChange: (mode) => preferred.push(mode) }),
    );

    state.setMode("custom");

    expect(preferred).toEqual(["custom"]);
  });
});

describe("styleFieldState — writers", () => {
  test("setLiteral('') clears by default", () => {
    const writes: (string | null)[] = [];
    const state = styleFieldState(
      padding,
      "20px",
      undefined,
      options({ onChange: (value) => writes.push(value) }),
    );

    state.setLiteral("");

    expect(writes).toEqual([null]);
  });

  test("setLiteral('') keeps the empty declaration when emptyLiteralClears is false", () => {
    const writes: (string | null)[] = [];
    const state = styleFieldState(
      padding,
      "20px",
      undefined,
      options({
        onChange: (value) => writes.push(value),
        emptyLiteralClears: false,
      }),
    );

    state.setLiteral("");

    expect(writes).toEqual([""]);
  });

  test("clear emits null", () => {
    const writes: (string | null)[] = [];
    const state = styleFieldState(
      padding,
      "20px",
      undefined,
      options({ onChange: (value) => writes.push(value) }),
    );

    state.clear();

    expect(writes).toEqual([null]);
  });
});

describe("styleFieldState — inherited value", () => {
  test.each([
    ["a token by its label", "var(--plumix-spacing-lg, 24px)", "Large"],
    ["a literal as written", "20px", "20px"],
  ])("an inherited value reads as %s", (_, inherited, expected) => {
    const state = styleFieldState(
      padding,
      undefined,
      undefined,
      options({ inherited }),
    );

    expect(state.inheritedText).toBe(expected);
  });

  test("a value set here shadows what it would inherit", () => {
    const state = styleFieldState(
      padding,
      "8px",
      undefined,
      options({ inherited: "20px" }),
    );

    expect(state.inheritedText).toBe("");
  });
});
