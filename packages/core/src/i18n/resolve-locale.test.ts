import { describe, expect, test } from "vitest";

import type { AuthenticatedUser } from "../context/app.js";
import { resolveLocales } from "./locale-registry.js";
import { resolveLocale } from "./resolve-locale.js";

const enFr = resolveLocales({
  defaultLocale: "en",
  locales: ["en", "fr"],
});

const REQUEST = new Request("https://cms.example/post");
const ADMIN_URL = "https://cms.example/_plumix/admin/";

function adminRequest(
  opts: { url?: string; cookie?: string; acceptLanguage?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.acceptLanguage) headers["accept-language"] = opts.acceptLanguage;
  return new Request(opts.url ?? ADMIN_URL, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

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
      request: adminRequest(),
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
      request: adminRequest(),
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

  test("user.meta.locale wins over site default on admin paths (WP get_user_locale parity)", () => {
    const resolved = resolveLocale({
      request: adminRequest(),
      user: user({ locale: "fr" }),
      i18n: enFr,
    });
    expect(resolved.code).toBe("fr");
  });

  test("user.meta.locale is ignored on public paths so CDN caching stays per-URL (WP frontend/admin split)", () => {
    const resolved = resolveLocale({
      request: REQUEST,
      user: user({ locale: "fr" }),
      i18n: enFr,
    });
    expect(resolved.code).toBe("en");
  });

  test("plumix_locale cookie applies for anonymous visitors (WP wp_lang parity)", () => {
    const resolved = resolveLocale({
      request: adminRequest({ cookie: "plumix_locale=fr" }),
      user: null,
      i18n: enFr,
    });
    expect(resolved.code).toBe("fr");
  });

  test("user.meta.locale wins over the cookie when both are present", () => {
    const resolved = resolveLocale({
      request: adminRequest({ cookie: "plumix_locale=en" }),
      user: user({ locale: "fr" }),
      i18n: enFr,
    });
    expect(resolved.code).toBe("fr");
  });

  test("cookie pointing at an unsupported code falls through to the default", () => {
    const resolved = resolveLocale({
      request: adminRequest({ cookie: "plumix_locale=de" }),
      user: null,
      i18n: enFr,
    });
    expect(resolved.code).toBe("en");
  });

  test("?lang= wins over user.meta.locale AND cookie (full 3-way precedence)", () => {
    const enArFr = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar", "fr"],
    });
    const resolved = resolveLocale({
      request: adminRequest({
        url: `${ADMIN_URL}?lang=ar`,
        cookie: "plumix_locale=fr",
      }),
      user: user({ locale: "fr" }),
      i18n: enArFr,
    });
    expect(resolved.code).toBe("ar");
  });

  test("?lang= query param wins over user.meta.locale", () => {
    const resolved = resolveLocale({
      request: adminRequest({ url: `${ADMIN_URL}?lang=fr` }),
      user: user({ locale: "en" }),
      i18n: enFr,
    });
    expect(resolved.code).toBe("fr");
  });

  test("Accept-Language exact tag matches on admin paths when no other signal applies", () => {
    const enArFr = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar", "fr"],
    });
    const resolved = resolveLocale({
      request: adminRequest({ acceptLanguage: "ar,en;q=0.5" }),
      user: null,
      i18n: enArFr,
    });
    expect(resolved.code).toBe("ar");
  });

  test("Accept-Language is IGNORED on public-route paths (cache invariant)", () => {
    // Public-route HTML must stay identical per URL across browsers so CDN
    // cache keys don't fragment by Accept-Language. Picking up the header
    // here would silently break that.
    const enArFr = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar", "fr"],
    });
    const publicReq = new Request("https://cms.example/blog/hello", {
      headers: { "accept-language": "ar" },
    });
    const resolved = resolveLocale({
      request: publicReq,
      user: null,
      i18n: enArFr,
    });
    expect(resolved.code).toBe("en");
  });

  test("cookie still wins over Accept-Language when both are present", () => {
    const enArFr = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar", "fr"],
    });
    const resolved = resolveLocale({
      request: adminRequest({
        cookie: "plumix_locale=fr",
        acceptLanguage: "ar",
      }),
      user: null,
      i18n: enArFr,
    });
    expect(resolved.code).toBe("fr");
  });

  test("Accept-Language script tag maps to the supported regional variant (zh-Hant → zh-TW)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "zh-TW"],
    });
    const resolved = resolveLocale({
      request: adminRequest({ acceptLanguage: "zh-Hant" }),
      user: null,
      i18n,
    });
    expect(resolved.code).toBe("zh-TW");
  });

  test("Accept-Language base language falls back to a supported regional variant (pt-PT → pt-BR)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "pt-BR"],
    });
    const resolved = resolveLocale({
      request: adminRequest({ acceptLanguage: "pt-PT" }),
      user: null,
      i18n,
    });
    expect(resolved.code).toBe("pt-BR");
  });

  test("Accept-Language is case-insensitive (ZH-HANT → zh-TW)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "zh-TW"],
    });
    const resolved = resolveLocale({
      request: adminRequest({ acceptLanguage: "ZH-HANT" }),
      user: null,
      i18n,
    });
    expect(resolved.code).toBe("zh-TW");
  });

  test("Accept-Language iteration is capped — hostile header falls through to default", () => {
    const enArFr = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "ar", "fr"],
    });
    const hostile = `${Array.from({ length: 5000 }, () => "zz-ZZ").join(",")},ar`;
    const resolved = resolveLocale({
      request: adminRequest({ acceptLanguage: hostile }),
      user: null,
      i18n: enArFr,
    });
    expect(resolved.code).toBe("en");
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
