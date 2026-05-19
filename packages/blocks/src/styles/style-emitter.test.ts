import type { BlockStyleSlot } from "./style-emitter.js";
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
    const style: BlockStyleSlot = { large: { padding: "lg" } };

    expect(emitBlockStyleCss("block-1", style, tokens)).toBe(
      ".block-1 { padding: var(--plumix-spacing-lg, 24px); }",
    );
  });

  test("emits desktop-first cascade with @media wrappers for medium and small", () => {
    const style: BlockStyleSlot = {
      large: { padding: "lg" },
      small: { padding: "sm" },
    };

    const css = emitBlockStyleCss("block-1", style, tokens);

    expect(css).toContain(
      ".block-1 { padding: var(--plumix-spacing-lg, 24px); }",
    );
    expect(css).toContain(
      "@media (max-width: 640px) { .block-1 { padding: var(--plumix-spacing-sm, 8px); } }",
    );
  });

  test("returns an empty string for missing or empty style slot", () => {
    expect(emitBlockStyleCss("block-1", undefined, tokens)).toBe("");
    expect(emitBlockStyleCss("block-1", {}, tokens)).toBe("");
  });

  test("converts camelCase CSS properties to kebab-case", () => {
    const style: BlockStyleSlot = { large: { fontSize: "lg" } };

    expect(emitBlockStyleCss("b", style, { typography: { lg: { value: "20px" } } })).toBe(
      ".b { font-size: var(--plumix-typography-lg, 20px); }",
    );
  });
});
