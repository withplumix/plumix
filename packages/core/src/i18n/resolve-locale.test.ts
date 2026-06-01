import { describe, expect, test } from "vitest";

import type { AuthenticatedUser } from "../context/app.js";
import { resolveLocales } from "./locale-registry.js";
import { resolveLocale } from "./resolve-locale.js";

const enFr = resolveLocales({
  defaultLocale: "en",
  locales: ["en", "fr"],
});

const REQUEST = new Request("https://cms.example/post");

function user(meta: Record<string, unknown> = {}): AuthenticatedUser {
  return { id: 1, email: "u@x", role: "admin", meta };
}

describe("resolveLocale", () => {
  test("anonymous request returns the site defaultLocale (WP get_locale parity)", () => {
    const resolved = resolveLocale({
      request: REQUEST,
      user: null,
      i18n: enFr,
    });
    expect(resolved).toBe(enFr.defaultLocale);
  });

  test("override returning a registry locale short-circuits the chain", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar"],
      resolveLocale: () => ({
        code: "ar",
        label: "Arabic",
        direction: "rtl",
        enabled: true,
      }),
    });

    const resolved = resolveLocale({
      request: REQUEST,
      user: user({ locale: "en" }),
      i18n,
    });

    expect(resolved.code).toBe("ar");
  });

  test("override returning null falls through to the rest of the chain", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "fr"],
      resolveLocale: () => null,
    });

    const resolved = resolveLocale({
      request: REQUEST,
      user: user({ locale: "fr" }),
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
      request: REQUEST,
      user: user({ locale: "fr" }),
      i18n,
    });

    expect(resolved.code).toBe("fr");
  });

  test("override pointing at a disabled-in-registry locale is ignored", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", { code: "fr", enabled: false }],
      resolveLocale: () => ({
        code: "fr",
        label: "French",
        direction: "ltr",
        enabled: true,
      }),
    });

    const resolved = resolveLocale({
      request: REQUEST,
      user: null,
      i18n,
    });

    expect(resolved.code).toBe("en");
  });

  test("user.meta.locale for an unsupported code falls through to site default", () => {
    const resolved = resolveLocale({
      request: REQUEST,
      user: user({ locale: "de" }),
      i18n: enFr,
    });
    expect(resolved.code).toBe("en");
  });

  test("user.meta.locale pointing at a disabled locale falls through", () => {
    const enFrDisabled = resolveLocales({
      defaultLocale: "en",
      locales: ["en", { code: "fr", enabled: false }],
    });
    const resolved = resolveLocale({
      request: REQUEST,
      user: user({ locale: "fr" }),
      i18n: enFrDisabled,
    });
    expect(resolved.code).toBe("en");
  });

  test("user.meta.locale wins over site default (WP get_user_locale parity)", () => {
    const resolved = resolveLocale({
      request: REQUEST,
      user: user({ locale: "fr" }),
      i18n: enFr,
    });
    expect(resolved.code).toBe("fr");
  });

  test("user.meta.locale canonicalizes ('en_us' matches an 'en-US' registry entry)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en-US",
      locales: ["en-US", "fr"],
    });
    const resolved = resolveLocale({
      request: REQUEST,
      user: user({ locale: "en_us" }),
      i18n,
    });
    expect(resolved.code).toBe("en-US");
  });
});
