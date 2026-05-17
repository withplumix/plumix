import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { ThemeTokens } from "./types.js";
import {
  ThemeTokensProvider,
  useBlockStyles,
  useThemeTokens,
} from "./hooks.js";

function wrapper(tokens: ThemeTokens) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ThemeTokensProvider value={tokens}>{children}</ThemeTokensProvider>;
  };
}

describe("useThemeTokens / useBlockStyles", () => {
  test("useThemeTokens returns empty tokens by default (no provider)", () => {
    const { result } = renderHook(() => useThemeTokens());
    expect(result.current).toEqual({});
  });

  test("useThemeTokens returns the provided tokens through context", () => {
    const tokens: ThemeTokens = {
      colors: { primary: { value: "#0066cc" } },
    };
    const { result } = renderHook(() => useThemeTokens(), {
      wrapper: wrapper(tokens),
    });
    expect(result.current).toBe(tokens);
  });

  test("useBlockStyles resolves through useThemeTokens output", () => {
    const tokens: ThemeTokens = {
      colors: { primary: { value: "#0066cc" } },
    };
    const { result } = renderHook(
      () =>
        useBlockStyles(
          { color: { background: "primary" } },
          { color: { background: true } },
        ),
      { wrapper: wrapper(tokens) },
    );
    expect(result.current.className).toBe("has-primary-background-color");
    expect(result.current.style).toEqual({});
  });
});
