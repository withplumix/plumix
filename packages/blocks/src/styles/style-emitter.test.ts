import { describe, expect, test } from "vitest";

import type { ResponsiveStyleSlot } from "./style-emitter.js";
import type { ThemeTokens } from "./types.js";
import {
  emitBlockStyleCss,
  normalizeStyleValue,
  tokenCategoryForProperty,
  tokenCssVar,
  tokenIdFromCssVar,
  tokenIdToCssVar,
} from "./style-emitter.js";

describe("normalizeStyleValue", () => {
  test("returns a non-empty string value unchanged", () => {
    expect(normalizeStyleValue("16px")).toBe("16px");
    expect(normalizeStyleValue("var(--plumix-color-primary, #000)")).toBe(
      "var(--plumix-color-primary, #000)",
    );
  });

  test("rejects malformed values", () => {
    expect(normalizeStyleValue(null)).toBeNull();
    expect(normalizeStyleValue("")).toBeNull();
    expect(normalizeStyleValue(2)).toBeNull();
    expect(normalizeStyleValue({})).toBeNull();
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

describe("tokenIdFromCssVar", () => {
  test("extracts the token id from a var() reference for the property's category", () => {
    expect(
      tokenIdFromCssVar("var(--plumix-color-primary, #0c2238)", "color"),
    ).toBe("primary");
    expect(tokenIdFromCssVar("var(--plumix-spacing-lg)", "spacing")).toBe("lg");
    // A multi-word category kebab-cases in the var segment.
    expect(
      tokenIdFromCssVar("var(--plumix-font-family-serif)", "fontFamily"),
    ).toBe("serif");
  });

  test("returns null for a literal value or a mismatched category", () => {
    expect(tokenIdFromCssVar("20px", "spacing")).toBeNull();
    expect(
      tokenIdFromCssVar("var(--plumix-color-primary)", "spacing"),
    ).toBeNull();
  });
});

describe("emitBlockStyleCss", () => {
  test("emits base CSS for the large bucket without a media-query wrapper", () => {
    const style: ResponsiveStyleSlot = {
      large: { padding: "var(--plumix-spacing-lg, 24px)" },
    };

    expect(emitBlockStyleCss("block-1", style)).toBe(
      ".block-1 { padding: var(--plumix-spacing-lg, 24px); }",
    );
  });

  test("emits desktop-first cascade with @media wrappers for medium and small", () => {
    const style: ResponsiveStyleSlot = {
      large: { padding: "var(--plumix-spacing-lg, 24px)" },
      medium: { padding: "var(--plumix-spacing-md, 16px)" },
      small: { padding: "var(--plumix-spacing-sm, 8px)" },
    };

    const css = emitBlockStyleCss("block-1", style);

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

  test("emits var() token references and literal values side by side", () => {
    const style: ResponsiveStyleSlot = {
      large: {
        padding: "20px",
        color: "var(--plumix-color-primary, #0c2238)",
      },
    };

    const css = emitBlockStyleCss("block-1", style);
    // A literal is emitted as-is; a var() reference reskins when the theme
    // redefines the custom property — both are just CSS value strings.
    expect(css).toContain("padding: 20px;");
    expect(css).toContain("color: var(--plumix-color-primary, #0c2238);");
  });

  test("emits a bare literal value as-is", () => {
    const css = emitBlockStyleCss("block-1", { large: { padding: "24px" } });
    expect(css).toBe(".block-1 { padding: 24px; }");
  });

  test("drops a value carrying a breakout vector", () => {
    const css = emitBlockStyleCss("block-1", {
      large: { padding: "1px } body { display:none" },
    });
    expect(css).toBe("");
  });

  test("uses theme-supplied breakpoints for the @media maxima when given", () => {
    const style: ResponsiveStyleSlot = {
      medium: { padding: "var(--plumix-spacing-lg, 24px)" },
      small: { padding: "var(--plumix-spacing-sm, 8px)" },
    };

    const css = emitBlockStyleCss("block-1", style, {
      tablet: 900,
      mobile: 500,
    });

    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 500px)");
    expect(css).not.toContain("991px");
    expect(css).not.toContain("640px");
  });

  test("emits arbitrary properties with their literal value (no token-scale gating)", () => {
    const style: ResponsiveStyleSlot = {
      large: { padding: "16px", width: "300px" },
    };

    const css = emitBlockStyleCss("block-1", style);

    expect(css).toContain("padding: 16px;");
    expect(css).toContain("width: 300px;");
  });

  test("skips style emission when the property name contains unsafe characters", () => {
    const style: ResponsiveStyleSlot = {
      large: {
        padding: "16px",
        "<script>": "16px",
        margin: "</style><script>alert(1)</script>",
      },
    };

    const css = emitBlockStyleCss("block-1", style);

    expect(css).toContain("padding: 16px;");
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("</style>");
  });

  test("returns an empty string for missing or empty style slot", () => {
    expect(emitBlockStyleCss("block-1", undefined)).toBe("");
    expect(emitBlockStyleCss("block-1", {})).toBe("");
  });

  test("overlays display:none for a hidden bucket, overriding its layout display", () => {
    // The block is laid out as flex on desktop AND hidden on desktop — hiding
    // wins, but the flex stays in the style slot (only the emitted CSS is none).
    const css = emitBlockStyleCss(
      "block-1",
      { large: { display: "flex", gap: "8px" } },
      undefined,
      { large: true },
    );

    expect(css).toContain(".block-1 { ");
    expect(css).toContain("display: none;");
    expect(css).toContain("gap: 8px;");
    expect(css).not.toContain("display: flex;");
  });

  test("emits a media-query display:none for a bucket hidden with no styles", () => {
    // Hidden only on mobile, no other styles anywhere: a single @media rule,
    // no bare base rule.
    const css = emitBlockStyleCss("block-1", undefined, undefined, {
      small: true,
    });

    expect(css).toBe(
      "@media (max-width: 640px) { .block-1 { display: none; } }",
    );
  });

  test("converts camelCase CSS properties to kebab-case", () => {
    const style: ResponsiveStyleSlot = { large: { fontSize: "20px" } };

    expect(emitBlockStyleCss("b", style)).toBe(".b { font-size: 20px; }");
  });

  test("builds a bare token CSS variable reference (no resolved fallback)", () => {
    // Category key === the var segment (kebab-cased); no fallback appended.
    expect(tokenCssVar("primary", "color")).toBe("var(--plumix-color-primary)");
    expect(tokenCssVar("lg", "spacing")).toBe("var(--plumix-spacing-lg)");
    expect(tokenCssVar("serif", "fontFamily")).toBe(
      "var(--plumix-font-family-serif)",
    );
  });

  test("emits the token var with the token's literal as fallback (kebab segment)", () => {
    const tokens: ThemeTokens = {
      fontFamily: { serif: { value: "Georgia, serif" } },
    };
    expect(tokenIdToCssVar("serif", "fontFamily", tokens)).toBe(
      "var(--plumix-font-family-serif, Georgia, serif)",
    );
  });

  test("tokenizes an arbitrary CSS property (open model, not a fixed enum)", () => {
    const tokens: ThemeTokens = { zIndex: { top: { value: "9999" } } };
    expect(tokenIdToCssVar("top", "zIndex", tokens)).toBe(
      "var(--plumix-z-index-top, 9999)",
    );
  });

  test("resolves the token category for a known property, undefined otherwise", () => {
    // Property-keyed: the category IS the property (no conflation).
    expect(tokenCategoryForProperty("marginTop")).toBe("spacing");
    expect(tokenCategoryForProperty("color")).toBe("color");
    expect(tokenCategoryForProperty("background")).toBe("color");
    expect(tokenCategoryForProperty("borderRadius")).toBe("borderRadius");
    // font-size reads its own scale, NOT the font-family bucket.
    expect(tokenCategoryForProperty("fontSize")).toBe("fontSize");
    expect(tokenCategoryForProperty("fontFamily")).toBe("fontFamily");
    // A property with no token scale (or an arbitrary custom one) has none.
    expect(tokenCategoryForProperty("display")).toBeUndefined();
    expect(tokenCategoryForProperty("--brand")).toBeUndefined();
  });

  test("preserves the case of custom properties (they are case-sensitive)", () => {
    const style: ResponsiveStyleSlot = {
      large: { "--brandColor": "#0c2238" },
    };

    expect(emitBlockStyleCss("b", style)).toBe(".b { --brandColor: #0c2238; }");
  });
});
