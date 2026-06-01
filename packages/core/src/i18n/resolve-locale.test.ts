import { describe, expect, test } from "vitest";

import type { AuthenticatedUser } from "../context/app.js";
import { resolveLocales } from "./locale-registry.js";
import { resolveLocale } from "./resolve-locale.js";

function user(meta: Record<string, unknown> = {}): AuthenticatedUser {
  return { id: 1, email: "u@x", role: "admin", meta };
}

const enFr = resolveLocales({
  defaultLocale: "en",
  locales: ["en", "fr"],
});

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://cms.example/post", { headers });
}

describe("resolveLocale", () => {
  test("falls back to the site defaultLocale when no signals match", () => {
    const resolved = resolveLocale({
      request: new Request("https://cms.example/post"),
      user: null,
      i18n: enFr,
    });

    expect(resolved).toBe(enFr.defaultLocale);
  });

  test("script tags map to the supported region (zh-Hant → zh-TW, zh-Hans → zh-CN)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "zh-TW", "zh-CN"],
    });

    expect(
      resolveLocale({
        request: request({ "accept-language": "zh-Hant" }),
        user: null,
        i18n,
      }).code,
    ).toBe("zh-TW");
    expect(
      resolveLocale({
        request: request({ "accept-language": "zh-Hans" }),
        user: null,
        i18n,
      }).code,
    ).toBe("zh-CN");
  });

  test("Accept-Language tags are matched case-insensitively (ZH-HANT → zh-TW)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "zh-TW"],
    });

    const resolved = resolveLocale({
      request: request({ "accept-language": "ZH-HANT" }),
      user: null,
      i18n,
    });

    expect(resolved.code).toBe("zh-TW");
  });

  test("base-language map falls through to the supported regional variant (pt-PT → pt-BR)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "pt-BR"],
    });

    const resolved = resolveLocale({
      request: request({ "accept-language": "pt-PT" }),
      user: null,
      i18n,
    });

    expect(resolved.code).toBe("pt-BR");
  });

  test("override returning a registry entry short-circuits the 4-step chain", () => {
    const arEn = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar"],
      resolveLocale: (_req, _u) =>
        arEn.locales.find((l) => l.code === "ar") ?? null,
    });

    const resolved = resolveLocale({
      request: request({ "accept-language": "en" }),
      user: user({ locale: "en" }),
      i18n: arEn,
    });

    expect(resolved.code).toBe("ar");
  });

  test("override returning null falls through to the default chain", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "fr"],
      resolveLocale: () => null,
    });

    const resolved = resolveLocale({
      request: request({ "accept-language": "fr" }),
      user: null,
      i18n,
    });

    expect(resolved.code).toBe("fr");
  });

  test("override returning a code not in the registry is ignored", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "fr"],
      resolveLocale: () => ({
        code: "de",
        label: "German",
        direction: "ltr",
        enabled: true,
      }),
    });

    const resolved = resolveLocale({
      request: request({ "accept-language": "fr" }),
      user: null,
      i18n,
    });

    expect(resolved.code).toBe("fr");
  });

  test("user.meta.locale wins over cookie + Accept-Language (WP get_user_locale parity)", () => {
    const resolved = resolveLocale({
      request: request({
        "accept-language": "en",
        cookie: "plumix-locale=en",
      }),
      user: user({ locale: "fr" }),
      i18n: enFr,
    });

    expect(resolved.code).toBe("fr");
  });

  test("user.meta.locale pointing at a disabled locale falls through", () => {
    const enFrDisabled = resolveLocales({
      defaultLocale: "en",
      locales: ["en", { code: "fr", enabled: false }],
    });

    const resolved = resolveLocale({
      request: request(),
      user: user({ locale: "fr" }),
      i18n: enFrDisabled,
    });

    expect(resolved.code).toBe("en");
  });

  test("plumix-locale cookie wins over Accept-Language", () => {
    const resolved = resolveLocale({
      request: request({
        "accept-language": "fr",
        cookie: "plumix-locale=en",
      }),
      user: null,
      i18n: enFr,
    });

    expect(resolved.code).toBe("en");
  });

  test("plumix-locale cookie with an unsupported code falls through to header", () => {
    const resolved = resolveLocale({
      request: request({
        "accept-language": "fr",
        cookie: "plumix-locale=de",
      }),
      user: null,
      i18n: enFr,
    });

    expect(resolved.code).toBe("fr");
  });

  test("plumix-locale cookie pointing at a disabled locale falls through", () => {
    const enFrDisabled = resolveLocales({
      defaultLocale: "en",
      locales: ["en", { code: "fr", enabled: false }],
    });

    const resolved = resolveLocale({
      request: request({ cookie: "plumix-locale=fr" }),
      user: null,
      i18n: enFrDisabled,
    });

    expect(resolved.code).toBe("en");
  });

  test("Accept-Language q-factor wins over list order", () => {
    const enAr = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar"],
    });

    const resolved = resolveLocale({
      request: request({ "accept-language": "en;q=0.5, ar;q=0.9" }),
      user: null,
      i18n: enAr,
    });

    expect(resolved.code).toBe("ar");
  });

  test("Accept-Language exact canonical tag wins over default", () => {
    const resolved = resolveLocale({
      request: request({ "accept-language": "fr" }),
      user: null,
      i18n: enFr,
    });

    expect(resolved.code).toBe("fr");
  });
});
