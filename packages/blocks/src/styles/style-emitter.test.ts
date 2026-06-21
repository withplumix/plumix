import { describe, expect, test } from "vitest";

import type { ResponsiveStyleSlot } from "./style-emitter.js";
import type { ThemeTokens } from "./types.js";
import {
  emitBlockStyleCss,
  normalizeStyleValue,
  tokenIdToCssVar,
} from "./style-emitter.js";

describe("normalizeStyleValue", () => {
  test("coerces a legacy bare-string value to a token ref (the migration)", () => {
    expect(normalizeStyleValue("lg")).toEqual({ token: "lg" });
  });

  test("passes through token and raw refs unchanged", () => {
    expect(normalizeStyleValue({ token: "primary" })).toEqual({
      token: "primary",
    });
    expect(normalizeStyleValue({ raw: "16px" })).toEqual({ raw: "16px" });
  });

  test("rejects malformed values", () => {
    expect(normalizeStyleValue(null)).toBeNull();
    expect(normalizeStyleValue({})).toBeNull();
    expect(normalizeStyleValue({ token: 2 })).toBeNull();
    expect(normalizeStyleValue({ raw: "", token: "x" })).toBeNull();
  });
});

describe("tokenIdToCssVar", () => {
  test("resolves a registered token to a CSS variable reference with the token's literal as fallback", () => {
    const tokens: ThemeTokens = {
      spacing: { lg: { value: "24px" } },
    };

    expect(tokenIdToCssVar("lg", "spacing", tokens)).toBe(
      "var(--plumix-spacing-lg, 24px)",
    );
  });

  test("returns a CSS variable reference without fallback when the token is unregistered", () => {
    expect(tokenIdToCssVar("xl", "spacing", {})).toBe(
      "var(--plumix-spacing-xl)",
    );
  });

  test("returns a CSS variable reference without fallback when the token is registered with no value (label-only)", () => {
    const tokens: ThemeTokens = {
      spacing: { lg: { label: "Large" } },
    };

    expect(tokenIdToCssVar("lg", "spacing", tokens)).toBe(
      "var(--plumix-spacing-lg)",
    );
  });
});

describe("emitBlockStyleCss", () => {
  const tokens: ThemeTokens = {
    spacing: { lg: { value: "24px" }, sm: { value: "8px" } },
    colors: { primary: { value: "#0c2238" } },
  };

  test("emits base CSS for the large bucket without a media-query wrapper", () => {
    const style: ResponsiveStyleSlot = { large: { padding: "lg" } };

    expect(emitBlockStyleCss("block-1", style, tokens)).toBe(
      ".block-1 { padding: var(--plumix-spacing-lg, 24px); }",
    );
  });

  test("emits desktop-first cascade with @media wrappers for medium and small", () => {
    const style: ResponsiveStyleSlot = {
      large: { padding: "lg" },
      medium: { padding: "md" },
      small: { padding: "sm" },
    };
    const tokensWithMedium: ThemeTokens = {
      spacing: {
        lg: { value: "24px" },
        md: { value: "16px" },
        sm: { value: "8px" },
      },
    };

    const css = emitBlockStyleCss("block-1", style, tokensWithMedium);

    expect(css).toContain(
      ".block-1 { padding: var(--plumix-spacing-lg, 24px); }",
    );
    expect(css).toContain(
      "@media (max-width: 991px) { .block-1 { padding: var(--plumix-spacing-md, 16px); } }",
    );
    expect(css).toContain(
      "@media (max-width: 640px) { .block-1 { padding: var(--plumix-spacing-sm, 8px); } }",
    );
  });

  test("resolves the radius and shadow token categories", () => {
    const themed: ThemeTokens = {
      radius: { md: { value: "8px" } },
      shadow: { lg: { value: "0 4px 8px rgba(0,0,0,0.1)" } },
    };
    const css = emitBlockStyleCss(
      "block-1",
      { large: { borderRadius: { token: "md" }, boxShadow: { token: "lg" } } },
      themed,
    );
    expect(css).toContain("border-radius: var(--plumix-radius-md, 8px);");
    expect(css).toContain(
      "box-shadow: var(--plumix-shadow-lg, 0 4px 8px rgba(0,0,0,0.1));",
    );
  });

  test("maps per-side spacing and extended typography properties", () => {
    const themed: ThemeTokens = {
      spacing: { sm: { value: "8px" } },
      typography: { bold: { value: "700" } },
    };
    const css = emitBlockStyleCss(
      "block-1",
      { large: { marginTop: { token: "sm" }, fontWeight: { token: "bold" } } },
      themed,
    );
    expect(css).toContain("margin-top: var(--plumix-spacing-sm, 8px);");
    expect(css).toContain("font-weight: var(--plumix-typography-bold, 700);");
  });

  test("emits raw custom values alongside token refs", () => {
    const style: ResponsiveStyleSlot = {
      large: { padding: { raw: "20px" }, color: { token: "primary" } },
    };

    const css = emitBlockStyleCss("block-1", style, tokens);
    // Raw value is emitted literally (fixed); token resolves to a CSS variable
    // (reskins when the token changes).
    expect(css).toContain("padding: 20px;");
    expect(css).toContain("color: var(--plumix-color-primary, #0c2238);");
  });

  test("a legacy bare-string value still resolves as a token (no visual change)", () => {
    const css = emitBlockStyleCss(
      "block-1",
      { large: { padding: "lg" } },
      tokens,
    );
    expect(css).toBe(".block-1 { padding: var(--plumix-spacing-lg, 24px); }");
  });

  test("drops a raw value carrying a breakout vector", () => {
    const css = emitBlockStyleCss(
      "block-1",
      { large: { padding: { raw: "1px } body { display:none" } } },
      tokens,
    );
    expect(css).toBe("");
  });

  test("uses theme-supplied breakpoints for the @media maxima when given", () => {
    const style: ResponsiveStyleSlot = {
      medium: { padding: "lg" },
      small: { padding: "sm" },
    };

    const css = emitBlockStyleCss("block-1", style, tokens, {
      tablet: 900,
      mobile: 500,
    });

    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 500px)");
    expect(css).not.toContain("991px");
    expect(css).not.toContain("640px");
  });

  test("skips unmapped CSS properties without emitting raw token ids as literal CSS values", () => {
    const style: ResponsiveStyleSlot = {
      large: { padding: "lg", width: "lg" },
    };

    const css = emitBlockStyleCss("block-1", style, tokens);

    expect(css).toContain("padding: var(--plumix-spacing-lg, 24px);");
    expect(css).not.toContain("width: lg");
    expect(css).not.toContain("width:");
  });

  test("skips style emission when the property or token name contains unsafe characters", () => {
    const style: ResponsiveStyleSlot = {
      large: {
        padding: "lg",
        "<script>": "lg",
        margin: "</style><script>alert(1)</script>",
      },
    };

    const css = emitBlockStyleCss("block-1", style, tokens);

    expect(css).toContain("padding: var(--plumix-spacing-lg, 24px);");
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("</style>");
  });

  test("returns an empty string for missing or empty style slot", () => {
    expect(emitBlockStyleCss("block-1", undefined, tokens)).toBe("");
    expect(emitBlockStyleCss("block-1", {}, tokens)).toBe("");
  });

  test("converts camelCase CSS properties to kebab-case", () => {
    const style: ResponsiveStyleSlot = { large: { fontSize: "lg" } };

    expect(
      emitBlockStyleCss("b", style, { typography: { lg: { value: "20px" } } }),
    ).toBe(".b { font-size: var(--plumix-typography-lg, 20px); }");
  });
});
