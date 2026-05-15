import { describe, expect, test } from "vitest";

import { ThemeError } from "./theme-errors.js";

describe("ThemeError.invalidThemeId", () => {
  test("class identity, code, and exposed themeId", () => {
    const err = ThemeError.invalidThemeId({
      themeId: "Bad Id!",
      pattern: "^[a-z][a-z0-9-]*$",
      maxLength: 64,
    });
    expect(err).toBeInstanceOf(ThemeError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ThemeError");
    expect(err.code).toBe("invalid_theme_id");
    expect(err.themeId).toBe("Bad Id!");
  });

  test("message interpolates the bad id, the regex, and the length cap from context", () => {
    const err = ThemeError.invalidThemeId({
      themeId: "Bad Id!",
      pattern: "^[a-z][a-z0-9-]*$",
      maxLength: 64,
    });
    expect(err.message).toContain('defineTheme: id "Bad Id!" is invalid');
    expect(err.message).toContain("^[a-z][a-z0-9-]*$");
    expect(err.message).toContain("64");
  });
});

describe("ThemeError.setupNotAFunction", () => {
  test("class identity, code, and exposed themeId", () => {
    const err = ThemeError.setupNotAFunction({ themeId: "blog" });
    expect(err).toBeInstanceOf(ThemeError);
    expect(err.name).toBe("ThemeError");
    expect(err.code).toBe("setup_not_a_function");
    expect(err.themeId).toBe("blog");
  });

  test("message names defineTheme and the offending theme id", () => {
    const err = ThemeError.setupNotAFunction({ themeId: "blog" });
    expect(err.message).toContain('defineTheme("blog")');
    expect(err.message).toContain("`setup` must be a function");
  });
});
