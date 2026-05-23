import { describe, expect, test } from "vitest";

import { ThemeError } from "./theme-errors.js";

describe("ThemeError.invalidTokenSlug", () => {
  test("class identity, code, group, slug", () => {
    const err = ThemeError.invalidTokenSlug({
      group: "colors",
      slug: "x } body",
    });
    expect(err).toBeInstanceOf(ThemeError);
    expect(err.code).toBe("invalid_token_slug");
    expect(err.group).toBe("colors");
    expect(err.slug).toBe("x } body");
    expect(err.message).toContain("tokens.colors");
  });
});

describe("ThemeError.invalidTokenValue", () => {
  test("class identity, code, group, slug", () => {
    const err = ThemeError.invalidTokenValue({
      group: "colors",
      slug: "primary",
      value: "#fff; } body { display:none",
    });
    expect(err).toBeInstanceOf(ThemeError);
    expect(err.code).toBe("invalid_token_value");
    expect(err.group).toBe("colors");
    expect(err.slug).toBe("primary");
    expect(err.message).toContain("tokens.colors.primary");
  });
});
