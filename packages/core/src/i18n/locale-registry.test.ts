import { describe, expect, test } from "vitest";

import { resolveLocales } from "./locale-registry.js";

describe("resolveLocales", () => {
  test("codes-only entry derives label endonym, ltr direction, enabled true", () => {
    const registry = resolveLocales({
      defaultLocale: "en",
      locales: ["en"],
    });

    expect(registry.locales).toEqual([
      { code: "en", label: "English", direction: "ltr", enabled: true },
    ]);
  });

  test("object-form entry honors label, direction, enabled overrides", () => {
    const registry = resolveLocales({
      defaultLocale: "en",
      locales: [
        "en",
        { code: "cy", label: "Cymraeg", direction: "rtl", enabled: false },
      ],
    });

    expect(registry.locales[1]).toEqual({
      code: "cy",
      label: "Cymraeg",
      direction: "rtl",
      enabled: false,
    });
  });

  test("canonicalizes underscores in codes (zh_CN → zh-CN)", () => {
    const registry = resolveLocales({
      defaultLocale: "zh_CN",
      locales: ["zh_CN"],
    });
    expect(registry.locales[0]?.code).toBe("zh-CN");
    expect(registry.defaultLocale.code).toBe("zh-CN");
  });

  test("defaultLocale points at the canonicalized entry in the locales list", () => {
    const registry = resolveLocales({
      defaultLocale: "zh_CN",
      locales: ["zh_CN", "en"],
    });
    expect(registry.defaultLocale).toBe(registry.locales[0]);
    expect(registry.defaultLocale.code).toBe("zh-CN");
  });

  test("defaultLocale entry with enabled:false throws (the default can't be hidden)", () => {
    expect(() =>
      resolveLocales({
        defaultLocale: "en",
        locales: [{ code: "en", enabled: false }, "ar"],
      }),
    ).toThrow(/enabled/);
  });

  test("defaultLocale missing from locales throws with the offending code", () => {
    expect(() =>
      resolveLocales({ defaultLocale: "fr", locales: ["en", "ar"] }),
    ).toThrow(/fr/);
  });

  test("non-canonicalizable code throws with the offending code", () => {
    expect(() =>
      resolveLocales({ defaultLocale: "en", locales: ["en", "__nope__"] }),
    ).toThrow(/__nope__/);
  });

  test("region-tagged RTL locales still derive direction rtl (ar-EG, he-IL)", () => {
    const registry = resolveLocales({
      defaultLocale: "ar-EG",
      locales: ["ar-EG", "he-IL", "en-US"],
    });

    expect(registry.locales.map((l) => [l.code, l.direction])).toEqual([
      ["ar-EG", "rtl"],
      ["he-IL", "rtl"],
      ["en-US", "ltr"],
    ]);
  });

  test("RTL set codes derive direction rtl (ar, fa, he, ps, sd, ug, ur, yi)", () => {
    const registry = resolveLocales({
      defaultLocale: "ar",
      locales: ["ar", "fa", "he", "ps", "sd", "ug", "ur", "yi", "en"],
    });

    const directions = Object.fromEntries(
      registry.locales.map((l) => [l.code, l.direction]),
    );
    expect(directions).toEqual({
      ar: "rtl",
      fa: "rtl",
      he: "rtl",
      ps: "rtl",
      sd: "rtl",
      ug: "rtl",
      ur: "rtl",
      yi: "rtl",
      en: "ltr",
    });
  });
});
