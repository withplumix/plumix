import { describe, expect, test } from "vitest";

import { catalogLocale } from "./catalog-locale.js";

describe("catalogLocale", () => {
  test.each([
    { locale: "de", shipped: ["en", "de"], expected: "de" },
    { locale: "de-DE", shipped: ["en", "de", "de-DE"], expected: "de-DE" },
    { locale: "zh-cn", shipped: ["en", "zh-CN"], expected: "zh-CN" },
    {
      locale: "ZH-Hant-TW",
      shipped: ["en", "zh-Hant-TW"],
      expected: "zh-Hant-TW",
    },
  ])(
    "reads the catalog of the exact tag, whatever its case: $locale reads $expected",
    ({ locale, shipped, expected }) => {
      expect(catalogLocale(locale, shipped, "en")).toBe(expected);
    },
  );

  test.each([
    { locale: "es-MX", shipped: ["en", "es", "es-419"], expected: "es-419" },
    { locale: "es-MX", shipped: ["en", "es"], expected: "es" },
    { locale: "pt-AO", shipped: ["en", "pt", "pt-PT"], expected: "pt-PT" },
  ])(
    "climbs CLDR parent locales: $locale reads $expected from $shipped",
    ({ locale, shipped, expected }) => {
      expect(catalogLocale(locale, shipped, "en")).toBe(expected);
    },
  );

  test.each([
    { locale: "de-AT", shipped: ["en", "de"], expected: "de" },
    {
      locale: "sr-Latn-RS",
      shipped: ["en", "sr", "sr-Latn"],
      expected: "sr-Latn",
    },
    { locale: "sr-RS", shipped: ["en", "sr", "sr-Latn"], expected: "sr" },
  ])(
    "drops the last subtag, one at a time: $locale reads $expected",
    ({ locale, shipped, expected }) => {
      expect(catalogLocale(locale, shipped, "en")).toBe(expected);
    },
  );

  test.each([
    { locale: "zh-TW", shipped: ["en", "zh-CN"], expected: "en" },
    { locale: "zh-HK", shipped: ["en", "zh-CN"], expected: "en" },
    { locale: "sr-Latn-RS", shipped: ["en", "sr"], expected: "en" },
    { locale: "zh-SG", shipped: ["en", "zh-CN"], expected: "zh-CN" },
  ])(
    "never crosses a script: $locale reads $expected from $shipped",
    ({ locale, shipped, expected }) => {
      expect(catalogLocale(locale, shipped, "en")).toBe(expected);
    },
  );

  test("never reads a two-letter language for a three-letter one sharing its prefix", () => {
    expect(catalogLocale("fil", ["en", "fi"], "en")).toBe("en");
  });

  test("reads the source catalog when no catalog fits", () => {
    expect(catalogLocale("fr-FR", ["en", "de"], "en")).toBe("en");
  });
});
