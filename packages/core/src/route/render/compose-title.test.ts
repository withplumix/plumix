import { describe, expect, test } from "vitest";

import type { TitleTemplate } from "../../theme.js";
import { composeTitle } from "./compose-title.js";

const defaults = {
  templateTitle: undefined as string | undefined,
  templateAbsolute: false,
  themeTitleTemplate: undefined as TitleTemplate | undefined,
  resolverTitle: "Resolver",
};

const compose = (overrides: Partial<typeof defaults>): string =>
  composeTitle({ ...defaults, ...overrides });

describe("composeTitle", () => {
  test("string titleTemplate substitutes %s with the template title", () => {
    expect(
      compose({ templateTitle: "Hello", themeTitleTemplate: "%s · Site" }),
    ).toBe("Hello · Site");
  });

  test("function titleTemplate receives the template title", () => {
    expect(
      compose({
        templateTitle: "Hello",
        themeTitleTemplate: (title) => (title ? `${title} · Site` : "Site"),
      }),
    ).toBe("Hello · Site");
  });

  test("function titleTemplate receives undefined when no template supplies title", () => {
    expect(
      compose({
        themeTitleTemplate: (title) => title ?? "Site Default",
      }),
    ).toBe("Site Default");
  });

  test("string titleTemplate with no template title falls back to resolver", () => {
    expect(compose({ themeTitleTemplate: "%s · Site" })).toBe("Resolver");
  });

  test("titleAbsolute: true bypasses titleTemplate", () => {
    expect(
      compose({
        templateTitle: "Home",
        templateAbsolute: true,
        themeTitleTemplate: "%s · Site",
      }),
    ).toBe("Home");
  });

  test("titleAbsolute: true with no template title falls through to resolver", () => {
    expect(
      compose({ templateAbsolute: true, themeTitleTemplate: "%s · Site" }),
    ).toBe("Resolver");
  });

  test("no titleTemplate, no template title → resolver title (back-compat)", () => {
    expect(compose({})).toBe("Resolver");
  });

  test("no titleTemplate, template-supplied title wins", () => {
    expect(compose({ templateTitle: "Template" })).toBe("Template");
  });

  test("string template substitutes every %s occurrence", () => {
    expect(
      compose({ templateTitle: "Hello", themeTitleTemplate: "%s — %s" }),
    ).toBe("Hello — Hello");
  });
});
