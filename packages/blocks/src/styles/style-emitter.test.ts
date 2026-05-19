import type { ResponsiveStyleSlot } from "./style-emitter.js";
import type { ThemeTokens } from "./types.js";
import { describe, expect, test } from "vitest";

import { emitBlockStyleCss, tokenIdToCssVar } from "./style-emitter.js";

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

    expect(emitBlockStyleCss("b", style, { typography: { lg: { value: "20px" } } })).toBe(
      ".b { font-size: var(--plumix-typography-lg, 20px); }",
    );
  });
});
