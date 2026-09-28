import type { ReactElement, ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ThemeTokens } from "@plumix/blocks";

import { StyleFieldsProvider } from "./style-fields-context.js";
import { useStyleField } from "./use-style-field.js";

afterEach(cleanup);

const tokens: ThemeTokens = {
  color: { primary: { value: "#0c2238", label: "Primary" } },
  spacing: { sm: { value: "8px" }, lg: { value: "24px", label: "Large" } },
};

function wrapper({ children }: { children: ReactNode }): ReactElement {
  return <StyleFieldsProvider tokens={tokens}>{children}</StyleFieldsProvider>;
}

function setup(
  property: string,
  value: string | undefined,
  options: Omit<Parameters<typeof useStyleField>[2], "onChange"> = {},
) {
  const onChange = vi.fn();
  const { result } = renderHook(
    () => useStyleField(property, value, { onChange, ...options }),
    { wrapper },
  );
  return { result, onChange };
}

describe("useStyleField — mode derivation", () => {
  test("a token value drives token mode", () => {
    const { result } = setup("padding", "var(--plumix-spacing-lg, 24px)");
    expect(result.current.mode).toBe("token");
    expect(result.current.tokenId).toBe("lg");
  });

  test("a literal value drives custom mode", () => {
    const { result } = setup("padding", "20px");
    expect(result.current.mode).toBe("custom");
    expect(result.current.literalText).toBe("20px");
  });

  test("with no value, mode defaults to token when the field has tokens", () => {
    const { result } = setup("padding", undefined);
    expect(result.current.mode).toBe("token");
  });

  test("with no value and no token scale, mode is custom", () => {
    const { result } = setup("display", undefined);
    expect(result.current.hasTokens).toBe(false);
    expect(result.current.mode).toBe("custom");
  });
});

describe("useStyleField — literalOnly (custom-only control)", () => {
  test("offers no tokens and shows a stored token var() as raw text", () => {
    const { result } = setup("padding", "var(--plumix-spacing-lg, 24px)", {
      literalOnly: true,
    });
    expect(result.current.hasTokens).toBe(false);
    expect(result.current.mode).toBe("custom");
    expect(result.current.tokenId).toBeNull();
    expect(result.current.literalText).toBe("var(--plumix-spacing-lg, 24px)");
  });
});

describe("useStyleField — setMode clears a value the target mode can't hold", () => {
  test("switching a token value to custom clears it", () => {
    const { result, onChange } = setup(
      "padding",
      "var(--plumix-spacing-lg, 24px)",
    );
    act(() => result.current.setMode("custom"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("switching a literal value to token clears it", () => {
    const { result, onChange } = setup("padding", "20px");
    act(() => result.current.setMode("token"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("switching modes with no value writes nothing", () => {
    const { result, onChange } = setup("padding", undefined);
    act(() => result.current.setMode("custom"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("useStyleField — writers", () => {
  test("setToken emits the token's var() value", () => {
    const { result, onChange } = setup("padding", undefined);
    act(() => result.current.setToken("lg"));
    expect(onChange).toHaveBeenCalledWith("var(--plumix-spacing-lg, 24px)");
  });

  test("setLiteral emits a raw value", () => {
    const { result, onChange } = setup("padding", undefined);
    act(() => result.current.setLiteral("20px"));
    expect(onChange).toHaveBeenCalledWith("20px");
  });

  test("setLiteral('') clears by default", () => {
    const { result, onChange } = setup("padding", "20px");
    act(() => result.current.setLiteral(""));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("setLiteral('') keeps the empty declaration when emptyLiteralClears is false", () => {
    const { result, onChange } = setup("padding", "20px", {
      emptyLiteralClears: false,
    });
    act(() => result.current.setLiteral(""));
    expect(onChange).toHaveBeenCalledWith("");
  });

  test("clear emits null", () => {
    const { result, onChange } = setup("padding", "20px");
    act(() => result.current.clear());
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("useStyleField — token scale passthrough", () => {
  test("exposes the field's options and category from the provider's tokens", () => {
    const { result } = setup("padding", undefined);
    expect(result.current.category).toBe("spacing");
    expect(result.current.options.map((o) => o.id)).toEqual(["sm", "lg"]);
  });

  test("an explicit category overrides the property-derived scale", () => {
    const { result } = setup("background", undefined, { category: "spacing" });
    expect(result.current.category).toBe("spacing");
    expect(result.current.options.map((o) => o.id)).toEqual(["sm", "lg"]);
  });
});
